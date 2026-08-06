"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  Maximize,
  Minimize,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Move,
} from "lucide-react";

interface PanoramaViewerProps {
  imageUrl: string;
  alt?: string;
  className?: string;
}

export default function PanoramaViewer({
  imageUrl,
  alt = "360° View",
  className = "",
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isInViewport, setIsInViewport] = useState(false);

  // Viewer parameters using refs to avoid re-triggering React renders during the animation loop
  const yaw = useRef(0); // actual horizontal angle in radians
  const pitch = useRef(0); // actual vertical angle in radians
  const targetYaw = useRef(0); // target horizontal angle in radians
  const targetPitch = useRef(0); // target vertical angle in radians
  const fov = useRef(1.2); // Field of View (Focal length) - Zoom level (lower = wider, higher = narrower)

  // Dragging and inertia state
  const isDragging = useRef(false);
  const startMouseX = useRef(0);
  const startMouseY = useRef(0);
  const startYaw = useRef(0);
  const startPitch = useRef(0);

  const velocityX = useRef(0);
  const velocityY = useRef(0);
  const lastTime = useRef(0);
  const lastMouseX = useRef(0);
  const lastMouseY = useRef(0);

  // Fullscreen state listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Viewport Intersection Observer (Lazy load high-res assets)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }, // Start loading 300px before scrolling into view
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Wheel Zoom Listener (Scroll to zoom, prevent body scroll in fullscreen)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isInViewport) return;

    const handleWheel = (e: WheelEvent) => {
      // ONLY zoom and block page scrolling if the viewer is actively in full-screen mode!
      if (!isFullscreen) return;

      // Prevent parent page scrolling while actively zooming the room
      e.preventDefault();
      // Block event propagation to prevent custom smooth scroll libraries (like Lenis) from catching it at the window level
      e.stopPropagation();

      // Standardize scroll delta across browsers and mice
      const sens = 0.0012;

      // Negative deltaY = scroll up = Zoom In (increase focal length fov)
      // Positive deltaY = scroll down = Zoom Out (decrease focal length fov)
      fov.current = Math.max(0.6, Math.min(2.5, fov.current - e.deltaY * sens));
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [isInViewport, isFullscreen]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable full-screen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const resetView = () => {
    targetYaw.current = 0;
    targetPitch.current = 0;
    yaw.current = 0;
    pitch.current = 0;
    fov.current = 1.2;
    velocityX.current = 0;
    velocityY.current = 0;
  };

  const adjustZoom = (amount: number) => {
    // Zoom in decreases FOV denominator (focal length increases), Zoom out increases FOV denominator
    fov.current = Math.max(0.6, Math.min(2.5, fov.current + amount));
  };

  // Main WebGL & Render Loop Setup
  useEffect(() => {
    if (!isInViewport) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      setError("WebGL is not supported in your browser.");
      setLoading(false);
      return;
    }

    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let animationFrameId: number;
    let isComponentMounted = true;

    // Load Image Texture
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = imageUrl;

    image.onload = () => {
      if (!isComponentMounted) return;

      // Initialize WebGL texture
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      // Set parameters for NPOT (Non-Power-Of-Two) texture compatibility
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );

      setLoading(false);
    };

    image.onerror = () => {
      if (!isComponentMounted) return;
      setError("Failed to load 360° panorama image.");
      setLoading(false);
    };

    // Shaders definition
    const vertexShaderSrc = `
      attribute vec2 a_position;
      varying vec2 v_position;
      void main() {
        v_position = a_position;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSrc = `
      precision highp float;
      varying vec2 v_position;
      uniform float u_aspect;
      uniform float u_yaw;
      uniform float u_pitch;
      uniform float u_fov;
      uniform sampler2D u_texture;

      #define PI 3.14159265359

      void main() {
        vec2 uv = v_position;
        uv.x *= u_aspect;

        // Vector pointing inside sphere from camera viewpoint
        vec3 dir = normalize(vec3(uv.x, uv.y, -u_fov));

        // Pitch rotation (around X axis)
        float cp = cos(u_pitch);
        float sp = sin(u_pitch);
        vec3 r1 = vec3(
          dir.x,
          dir.y * cp - dir.z * sp,
          dir.y * sp + dir.z * cp
        );

        // Yaw rotation (around Y axis)
        float cy = cos(u_yaw);
        float sy = sin(u_yaw);
        vec3 r2 = vec3(
          r1.x * cy + r1.z * sy,
          r1.y,
          -r1.x * sy + r1.z * cy
        );

        // Map to spherical coords
        float longitude = atan(r2.x, -r2.z); 
        float latitude = asin(r2.y);

        // Map spherical coords to 2D equirectangular texture coords
        // Using fract for horizontal wrapping provides NPOT safety with smooth repeating
        vec2 texUV = vec2(
          fract(longitude / (2.0 * PI) + 0.5),
          clamp(latitude / PI + 0.5, 0.0, 1.0)
        );

        gl_FragColor = texture2D(u_texture, texUV);
      }
    `;

    const compileShader = (
      source: string,
      type: number,
    ): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(vertexShaderSrc, gl.VERTEX_SHADER);
    const fs = compileShader(fragmentShaderSrc, gl.FRAGMENT_SHADER);

    if (vs && fs) {
      program = gl.createProgram();
      if (program) {
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.error(
            "Program linking error:",
            gl.getProgramInfoLog(program),
          );
        }
      }
    }

    // Geometry quad definition
    const vertices = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Uniform/Attribute locations
    const positionLocation = program
      ? gl.getAttribLocation(program, "a_position")
      : -1;
    const aspectLocation = program
      ? gl.getUniformLocation(program, "u_aspect")
      : null;
    const yawLocation = program
      ? gl.getUniformLocation(program, "u_yaw")
      : null;
    const pitchLocation = program
      ? gl.getUniformLocation(program, "u_pitch")
      : null;
    const fovLocation = program
      ? gl.getUniformLocation(program, "u_fov")
      : null;

    // Render loop
    const render = () => {
      if (!isComponentMounted) return;

      // Handle canvas resize with High-DPI (Retina) support
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const targetWidth = Math.round(width * dpr);
      const targetHeight = Math.round(height * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        gl.viewport(0, 0, targetWidth, targetHeight);
      }

      // Apply drag inertia / slow rotation when not dragging
      if (!isDragging.current) {
        // Slow auto-panning if the user hasn't interacted yet to show it is dynamic
        if (!hasInteracted) {
          targetYaw.current += 0.0005;
        }

        targetYaw.current += velocityX.current;
        targetPitch.current += velocityY.current;

        // Apply friction
        velocityX.current *= 0.93;
        velocityY.current *= 0.93;

        // Prevent floating numerical creeping
        if (Math.abs(velocityX.current) < 0.00001) velocityX.current = 0;
        if (Math.abs(velocityY.current) < 0.00001) velocityY.current = 0;
      }

      // Clamp target vertical pitch to look straight up or down, not past poles
      targetPitch.current = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, targetPitch.current),
      );

      // Butter-smooth interpolation (Lerping) actual angles to target angles
      const lerpFactor = 0.12; // Lower = smoother, floatier; Higher = faster reaction
      yaw.current += (targetYaw.current - yaw.current) * lerpFactor;
      pitch.current += (targetPitch.current - pitch.current) * lerpFactor;

      // Draw scene
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (program && texture) {
        gl.useProgram(program);

        gl.enableVertexAttribArray(positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        const aspect = canvas.width / canvas.height;
        gl.uniform1f(aspectLocation, aspect);
        gl.uniform1f(yawLocation, yaw.current);
        gl.uniform1f(pitchLocation, pitch.current);
        gl.uniform1f(fovLocation, fov.current);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      isComponentMounted = false;
      cancelAnimationFrame(animationFrameId);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
    };
  }, [imageUrl, hasInteracted, isInViewport]);

  // Pointer/Mouse handlers
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    setHasInteracted(true);

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    startMouseX.current = clientX;
    startMouseY.current = clientY;
    startYaw.current = targetYaw.current;
    startPitch.current = targetPitch.current;

    lastMouseX.current = clientX;
    lastMouseY.current = clientY;
    lastTime.current = performance.now();

    velocityX.current = 0;
    velocityY.current = 0;
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - startMouseX.current;
    const deltaY = clientY - startMouseY.current;

    // Scale rotation based on zoom level (narrower FOV = slower panning for high precision)
    const sens = 0.0035 * (fov.current / 1.2);

    targetYaw.current = startYaw.current - deltaX * sens;
    targetPitch.current = startPitch.current + deltaY * sens;

    // Calculate instantaneous velocity for inertia
    const now = performance.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocityX.current = -(clientX - lastMouseX.current) * sens * 0.15;
      velocityY.current = (clientY - lastMouseY.current) * sens * 0.15;
    }

    lastMouseX.current = clientX;
    lastMouseY.current = clientY;
    lastTime.current = now;
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video bg-[#0b0a09] rounded overflow-hidden select-none shadow group/pano ${className}`}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      aria-label={alt}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 text-white z-10">
          <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-mono tracking-wider opacity-75">
            LOADING 360° PANORAMA...
          </p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center text-white z-10">
          <p className="text-red-400 font-mono mb-2">ERROR</p>
          <p className="text-sm max-w-md opacity-80">{error}</p>
        </div>
      )}

      {/* Badge Indicator */}
      {!loading && !error && (
        <div className="absolute top-4 left-4 pointer-events-none flex items-center gap-2 bg-black/50 text-white backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-mono tracking-wider shadow border border-white/10 select-none">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          360° INTERACTIVE
        </div>
      )}

      {/* Overlay Helper Guide */}
      {!loading && !error && !hasInteracted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 bg-black/10 pointer-events-none transition-opacity duration-700 select-none z-5">
          <div className="bg-black/40 backdrop-blur-xs px-6 py-4 rounded flex flex-col items-center gap-2 max-w-xs text-center border border-white/5 shadow-2xl scale-95 group-hover/pano:scale-100 transition-transform duration-300">
            <Move className="w-8 h-8 opacity-75 animate-bounce" />
            <p className="text-sm font-semibold">Drag to Explore Room</p>
          </div>
        </div>
      )}

      {/* Glassmorphic Controls Bar */}
      {!loading && !error && (
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/45 backdrop-blur-md p-1.5 rounded border border-white/10 shadow-xl transition-opacity duration-300 opacity-60 group-hover/pano:opacity-100 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              adjustZoom(0.15);
            }}
            className="p-2 text-white/85 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
            title="Zoom In">
            <ZoomIn size={18} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              adjustZoom(-0.15);
            }}
            className="p-2 text-white/85 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
            title="Zoom Out">
            <ZoomOut size={18} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              resetView();
            }}
            className="p-2 text-white/85 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
            title="Reset Angle">
            <RotateCcw size={17} />
          </button>

          <div className="w-px h-6 bg-white/10 mx-0.5" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="p-2 text-white/85 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      )}
    </div>
  );
}
