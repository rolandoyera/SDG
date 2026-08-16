"use server";

import { FieldValue } from "firebase-admin/firestore";

import type { Project } from "@/lib/types";
import type {
  DropboxFolder,
  DropboxImage,
  DropboxIntegrationConfig,
} from "@/types/dropbox";

import { getActiveOrgId } from "./auth";
import {
  getValidDropboxAccessToken,
  listDropboxFolders,
  listDropboxImages,
} from "./dropbox";
import { getAdminDb } from "./firebase-admin";

/** Returns the tenant's Dropbox integration config, or null when not connected. */
export async function getDropboxConnection(): Promise<DropboxIntegrationConfig | null> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) return null;

  try {
    const snap = await getAdminDb()
      .collection("organizations")
      .doc(organizationId)
      .get();
    const dropbox = snap.exists
      ? (snap.data()?.config?.dropboxIntegration as
          | DropboxIntegrationConfig
          | undefined)
      : undefined;
    return dropbox?.connected ? dropbox : null;
  } catch (error) {
    console.error("Failed to load Dropbox connection:", error);
    return null;
  }
}

/** Lists the immediate subfolders at `path` (root is `""`) for the folder picker. */
export async function browseDropboxFolders(path: string): Promise<{
  success: boolean;
  folders?: DropboxFolder[];
  error?: string;
}> {
  const organizationId = await getActiveOrgId();
  if (!organizationId)
    return { success: false, error: "No active organization." };

  try {
    const accessToken = await getValidDropboxAccessToken(organizationId);
    if (!accessToken) {
      return { success: false, error: "Dropbox isn't connected." };
    }
    const folders = await listDropboxFolders(accessToken, path);
    return { success: true, folders };
  } catch (error) {
    console.error("Failed to browse Dropbox folders:", error);
    return { success: false, error: "Couldn't load folders from Dropbox." };
  }
}

/** Lists the images in the folder linked to a project's image set (for the gallery). */
export async function listProjectSetImages(
  projectId: string,
  setId: string,
): Promise<{ success: boolean; images?: DropboxImage[]; error?: string }> {
  const organizationId = await getActiveOrgId();
  if (!organizationId)
    return { success: false, error: "No active organization." };

  try {
    const snap = await getAdminDb().collection("projects").doc(projectId).get();
    const project = snap.exists ? (snap.data() as Project) : null;
    // Tenant guard — never read another org's project.
    if (!project || project.organizationId !== organizationId) {
      return { success: false, error: "Project not found." };
    }

    const linked = project.imagerySets?.[setId];
    if (!linked) return { success: false, error: "No folder linked." };

    const accessToken = await getValidDropboxAccessToken(organizationId);
    if (!accessToken) {
      return { success: false, error: "Dropbox isn't connected." };
    }
    const images = await listDropboxImages(accessToken, linked.path);
    return { success: true, images };
  } catch (error) {
    console.error("Failed to list project set images:", error);
    return { success: false, error: "Couldn't load images from Dropbox." };
  }
}

/** Clears the stored config and deletes the secret tokens for the active tenant. */
export async function disconnectDropbox(): Promise<{ success: boolean }> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) return { success: false };

  try {
    const orgRef = getAdminDb().collection("organizations").doc(organizationId);
    await orgRef.set(
      { config: { dropboxIntegration: FieldValue.delete() } },
      { merge: true },
    );
    await orgRef.collection("secrets").doc("dropbox").delete();
    return { success: true };
  } catch (error) {
    console.error("Failed to disconnect Dropbox:", error);
    return { success: false };
  }
}
