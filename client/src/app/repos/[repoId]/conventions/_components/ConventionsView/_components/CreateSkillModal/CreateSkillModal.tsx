/* CreateSkillModal — rolls the accepted conventions into the `repo-conventions`
   skill. The mockup wants Name/Description/Type/Enabled/body all editable
   before saving (criterion 41), but `POST /repos/:id/conventions/skill` only
   ever accepts `{agent_id?}` (server/src/modules/conventions/schemas.ts's
   `BuildSkillBody`) — it always builds its own body from the accepted rows.
   So: call that route first (it creates/updates the skill with the server's
   own template), then reconcile any of the user's edits that differ from the
   server's defaults via `PUT /skills/:id` (`useUpdateSkill`, already used
   elsewhere for exactly this shape of patch) — no invented endpoint. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useBuildConventionsSkill } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { DEFAULT_SKILL_NAME, DEFAULT_SKILL_TYPE, MODAL_WIDTH } from "./constants";
import { buildSkillMarkdownPreview, estimateTokens } from "./helpers";
import { s } from "./styles";

const SKILL_TYPE_OPTIONS: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export function CreateSkillModal({
  repoId,
  repoLabel,
  accepted,
  onClose,
  onCreated,
}: {
  repoId: string;
  repoLabel: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const build = useBuildConventionsSkill(repoId);
  const update = useUpdateSkill();

  const draftBody = React.useMemo(() => buildSkillMarkdownPreview(accepted, repoLabel), [accepted, repoLabel]);

  const [name, setName] = React.useState(DEFAULT_SKILL_NAME);
  const [description, setDescription] = React.useState(
    `House rules extracted and verified from ${repoLabel}`,
  );
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draftBody);
  const [error, setError] = React.useState<string | null>(null);

  const submitting = build.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    try {
      const skill = await build.mutateAsync(undefined);
      const patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> = {};
      if (name.trim() && name.trim() !== skill.name) patch.name = name.trim();
      if (description !== skill.description) patch.description = description;
      if (type !== skill.type) patch.type = type;
      if (enabled !== skill.enabled) patch.enabled = enabled;
      if (body !== skill.body) patch.body = body;
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync({ id: skill.id, patch });
      }
      toast.success(t("createSkill.success", { name: name.trim() || skill.name }));
      onClose();
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("createSkill.createFailed"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createSkill.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>{t("createSkill.footerNote")}</span>
          <Button kind="ghost" onClick={onClose} disabled={submitting}>
            {t("createSkill.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? t("createSkill.creating") : t("createSkill.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>{t("createSkill.banner", { count: accepted.length, repo: repoLabel })}</div>
        {error && (
          <div style={{ color: "var(--crit)", fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}
        <FormField label={t("createSkill.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("createSkill.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("createSkill.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("createSkill.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("createSkill.fields.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={SKILL_TYPE_OPTIONS.map((v) => ({ value: v, label: tSkills(`listItem.type.${v}`) }))}
          />
        </FormField>
        <FormField label={t("createSkill.fields.enabled")}>
          <div style={s.enabledRow}>
            <Toggle on={enabled} onChange={setEnabled} size={16} />
          </div>
        </FormField>
        <FormField label={t("createSkill.fields.body")}>
          <Textarea value={body} onChange={setBody} rows={12} mono />
          <div style={s.tokenCount}>{t("createSkill.tokens", { count: estimateTokens(body) })}</div>
        </FormField>
      </div>
    </Modal>
  );
}
