/* ConfigTab (skill editor) — name/description/type + the body editor
   (LineNumberedEditor) + an optional "what changed" note feeding
   change_note. Mirrors the shape of the agent editor's own ConfigTab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { LineNumberedEditor } from "@/components/line-numbered-editor";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_OPTIONS } from "./constants";
import { slug } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [draftBody, setDraftBody] = React.useState(skill.body);
  const [changeNote, setChangeNote] = React.useState("");

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setDraftBody(skill.body);
    setChangeNote("");
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPE_OPTIONS.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  // A change_note only has a version to attach to when the body itself
  // changes (server/src/modules/skills/repository.ts's `update` snapshots
  // skill_versions — with the note — only when `bodyChanged`; otherwise the
  // note is silently dropped, no error). Disable the field instead of
  // letting a typed note vanish with no explanation.
  const bodyChanged = draftBody !== skill.body;

  // Nothing to save — the button must stay disabled here, not just while a
  // save is in flight, or a no-op click still fires a full PUT (and, if body
  // happened to match some earlier draft round-trip byte-for-byte, could
  // read as a spurious "saved" toast with no real change behind it).
  const hasChanges =
    name !== skill.name || description !== skill.description || type !== skill.type || bodyChanged;

  // If the body reverts to the saved value after a note was typed, the note
  // is about to become unsaveable again — clear it so it can't be lost
  // silently on the next save.
  React.useEffect(() => {
    if (!bodyChanged && changeNote) setChangeNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyChanged]);

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: {
          name,
          description,
          type,
          body: draftBody,
          ...(changeNote.trim() ? { change_note: changeNote.trim() } : {}),
        },
      },
      {
        onSuccess: (data) => {
          toast.success(t("config.saved", { version: data.version }));
          setChangeNote("");
        },
      },
    );

  return (
    <div style={s.wrap}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{t("config.title")}</h2>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")}>
        <LineNumberedEditor
          filename={`${slug(name)}.md`}
          unsaved={draftBody !== skill.body}
          value={draftBody}
          onChange={setDraftBody}
        />
      </FormField>
      <FormField
        label={t("config.changeNote")}
        hint={bodyChanged ? t("config.changeNoteHint") : t("config.changeNoteDisabledHint")}
      >
        <TextInput
          value={changeNote}
          onChange={setChangeNote}
          placeholder={t("config.changeNotePlaceholder")}
          disabled={!bodyChanged}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !hasChanges}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>
    </div>
  );
}
