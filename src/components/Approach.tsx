"use client";
import { useState, useEffect } from "react";
import { PlusIcon, ChevronRight } from "lucide-react";
import Image from "next/image";
import Container from "./ui/Container";

interface AccordionPanel {
  title: string;
  content: string;
  image: string;
}
interface AccordionProps {
  panels?: AccordionPanel[];
  className?: string;
}

type Phase = "idle" | "closing" | "opening";

const OUT_MS = 220; // content fade out
const PANEL_MS = 500; // panel size transition (width on desktop, height on mobile)

const OurApproachSection: React.FC<AccordionProps> = ({
  panels: customPanels,
}) => {
  const [activePanel, setActivePanel] = useState<number | null>(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingPanel, setPendingPanel] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  const togglePanel = (index: number) => {
    if (locked) return;
    const next = index === activePanel ? null : index;
    setPendingPanel(next);
    setPhase("closing");
    setLocked(true);
  };

  useEffect(() => {
    if (phase !== "closing") return;
    const t1 = setTimeout(() => {
      setActivePanel(pendingPanel);
      setPhase("opening");
      const t2 = setTimeout(() => {
        setPhase("idle");
        setLocked(false);
      }, PANEL_MS);
      return () => clearTimeout(t2);
    }, OUT_MS);
    return () => clearTimeout(t1);
  }, [phase, pendingPanel]);

  const defaultPanels: AccordionPanel[] = [
    {
      title: "Discovery and Vision",
      content:
        "We begin with a collaborative kickoff to understand goals, lifestyle, and budget, then walk the site to assess opportunities and constraints. We discuss aesthetic direction, indoor–outdoor flow, and functional needs for every space. You'll receive a concise project brief outlining scope, priorities, mood references, timelines, and options for phasing.",
      image: "/assets/swatch-2.jpg",
    },
    {
      title: "Concept Design Presentation",
      content:
        "We translate the brief into preliminary floor plans, furniture layouts, and massing/elevation studies, supported by mood boards, materials, and early renderings. You'll see how architecture and interiors work together—spatial flow, focal moments, and a draft finishes palette. We review alternatives and align on a preferred concept and palette direction.",
      image: "/assets/drawing.jpg",
    },
    {
      title: "Refinement and Approval",
      content:
        "Incorporating feedback, we develop the design: detailed plans and elevations, millwork and built-ins, lighting concepts (layers, scenes, controls), and key FF&E selections. We fine-tune materials, fixtures, appliances, and color, coordinate with consultants, and reconcile scope with budget and timeline. The result is an approved, cohesive design package ready for execution.",
      image: "/slider/aventura-interior-design.jpg",
    },
    {
      title: "Procurement and Oversight",
      content:
        "We manage specifications, quoting, and purchase orders; track lead times, fabrication, and quality control; and coordinate warehousing, delivery, and installations. On site, we liaise with contractors and trades, answer RFIs, and monitor progress against schedule to protect design intent. You'll receive clear updates and proactive issue-resolution throughout.",
      image: "/assets/furniture-delivery.jpg",
    },
    {
      title: "Staging and Delivery",
      content:
        "Our team installs furnishings, hangs art, styles accessories, and dresses windows and bedding for a turnkey reveal. We handle punch-list items, provide care/maintenance guides, and ensure everything performs as intended. Follow-up visits confirm the space lives as beautifully as it looks.",
      image: "/assets/completed.jpg",
    },
  ];

  const panels = customPanels || defaultPanels;

  return (
    <Container className="flex flex-col">
      <h2 className="text-center text-h2">Our Methodology</h2>

      {/* DESKTOP/TABLET: sideways accordion */}
      <div className="hidden md:flex h-[600px] overflow-hidden w-4/5 mx-auto mt-12">
        {panels.map((panel, index) => {
          const isActive = activePanel === index;
          const isClosingThis = isActive && phase === "closing";
          const showContent = isActive && phase !== "closing";

          return (
            <div
              key={index}
              className={`transition-all duration-[${PANEL_MS}ms] ease-in-out overflow-hidden flex mr-2 rounded border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 ${
                isActive ? "flex-1" : "w-16"
              }`}>
              {/* Vertical tab */}
              <button
                onClick={() => togglePanel(index)}
                disabled={locked}
                className="w-16 h-full bg-banner focus:outline-none transition-colors duration-200 flex items-center justify-center text-white cursor-pointer border-0 flex-shrink-0 tracking-wider relative disabled:cursor-not-allowed"
                aria-expanded={isActive}
                aria-controls={`panel-desktop-${index}`}>
                <span className="font-medium text-white -rotate-90 whitespace-nowrap text-lg tracking-wider">
                  {panel.title}
                </span>
                {!isActive && (
                  <PlusIcon className="w-4 h-4 text-white/70 absolute bottom-4" />
                )}
              </button>

              {/* Content */}
              <div
                id={`panel-desktop-${index}`}
                className={`flex-1 text-foreground flex flex-col items-center px-6 py-6 overflow-hidden transition-all duration-[${PANEL_MS}ms] ease-in-out ${
                  showContent
                    ? "opacity-100"
                    : isClosingThis
                      ? "opacity-100"
                      : "opacity-0 w-0 px-0"
                }`}>
                <div
                  className={`transition-all ease-out ${
                    showContent
                      ? "opacity-100 translate-y-0 duration-700 delay-300"
                      : "opacity-0 -translate-y-8 duration-200"
                  }`}>
                  <Image
                    src={panel.image}
                    alt={panel.title}
                    width={600}
                    height={280}
                  />
                </div>
                <div
                  className={`text-left mt-auto transition-all ease-out ${
                    showContent
                      ? "opacity-100 translate-y-0 duration-700 delay-300"
                      : "opacity-0 translate-y-8 duration-200"
                  }`}>
                  <p className="text-foreground leading-relaxed">
                    {panel.content}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MOBILE: vertical accordion */}
      <div className="md:hidden w-11/12 mx-auto mt-8 space-y-3">
        {panels.map((panel, index) => {
          const isActive = activePanel === index;
          const isClosingThis = isActive && phase === "closing";
          const showContent = isActive && phase !== "closing";

          // Keep height expanded while closing so content can fade out smoothly
          const expanded = isActive || isClosingThis;

          return (
            <div
              key={index}
              className="rounded border border-black/10 dark:border-white/10 overflow-hidden bg-white/60 dark:bg-white/5">
              <button
                onClick={() => togglePanel(index)}
                disabled={locked}
                className="w-full flex items-center justify-between px-4 py-3 bg-banner text-white"
                aria-expanded={isActive}
                aria-controls={`panel-mobile-${index}`}>
                <span className="text-sm font-medium">{panel.title}</span>
                <ChevronRight
                  className={`w-4 h-4 transition-transform duration-300 ${isActive ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {/* Height animation via CSS grid rows (0fr -> 1fr) */}
              <div
                id={`panel-mobile-${index}`}
                className={`grid transition-[grid-template-rows] duration-[${PANEL_MS}ms] ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden px-4 py-3">
                  {/* Content fade/slide */}
                  <div
                    className={`transition-all ease-out ${
                      showContent
                        ? "opacity-100 translate-y-0 duration-700 delay-150"
                        : "opacity-0 translate-y-2 duration-200"
                    }`}>
                    <div className="relative w-full aspect-[16/9] mb-3">
                      <Image
                        src={panel.image}
                        alt={panel.title}
                        fill
                        className="object-cover rounded"
                      />
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                      {panel.content}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Container>
  );
};

export default OurApproachSection;
