/* ProjectDocPreviewDrawer — ProjectDocPreview inside the shared kit Drawer. */
"use client";

import React from "react";
import { Drawer } from "@devdigest/ui";
import { ProjectDocPreview, type ProjectDocPreviewProps } from "./ProjectDocPreview";

export interface ProjectDocPreviewDrawerProps extends ProjectDocPreviewProps {
  open: boolean;
  onClose: () => void;
}

export function ProjectDocPreviewDrawer({ open, onClose, ...preview }: ProjectDocPreviewDrawerProps) {
  if (!open) return null;
  return (
    <Drawer title={preview.path} onClose={onClose}>
      <ProjectDocPreview {...preview} />
    </Drawer>
  );
}
