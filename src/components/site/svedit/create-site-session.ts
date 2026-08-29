/**
 * @file src/components/site/svedit/create-site-session.ts
 * @description Creates a Svedit Session for site starter page documents.
 */

import CtaNode from "@components/site/svedit/cta-node.svelte";
import HeroNode from "@components/site/svedit/hero-node.svelte";
import Overlays from "@components/site/svedit/overlays.svelte";
import PageNode from "@components/site/svedit/page-node.svelte";
import ParagraphNode from "@components/site/svedit/paragraph-node.svelte";
import { sitePageDocumentSchema } from "@src/services/site/svedit/schema";
import type { SveditDocument } from "@src/services/site/svedit/types";
import {
  AddNewLineCommand,
  BreakTextNodeCommand,
  define_keymap,
  fill_document_defaults,
  InsertDefaultNodeCommand,
  RedoCommand,
  SelectAllCommand,
  SelectParentCommand,
  Session,
  UndoCommand,
} from "svedit";

function generateSveditNodeId(length = 16): string {
  // 🛡️ HARDENING: rejection-sampled uniform distribution over the alphabet.
  // `value % alphabet.length` was biased (256 % 26 !== 0) — a modulo bias in
  // a cryptographically-sourced random id (CodeQL js/biased-crypto-random).
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const alphabetLength = alphabet.length;
  // Largest multiple of alphabetLength ≤ 256 — rejection threshold.
  const maxValid = 256 - (256 % alphabetLength);
  let id = "n";
  while (id.length <= length) {
    const randomValues = globalThis.crypto.getRandomValues(new Uint8Array(length));
    for (const value of randomValues) {
      if (value >= maxValid) continue; // reject biased tail, draw again
      id += alphabet[value % alphabetLength];
      if (id.length > length) break;
    }
  }
  return id.slice(0, length + 1);
}

const sessionConfig = {
  generate_id: generateSveditNodeId,
  system_components: {
    overlays: Overlays,
  },
  node_components: {
    page: PageNode,
    hero: HeroNode,
    paragraph: ParagraphNode,
    cta: CtaNode,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create_commands_and_keymap: (context: any) => {
    const commands = {
      select_all: new SelectAllCommand(context),
      insert_default_node: new InsertDefaultNodeCommand(context),
      add_new_line: new AddNewLineCommand(context),
      break_text_node: new BreakTextNodeCommand(context),
      undo: new UndoCommand(context),
      redo: new RedoCommand(context),
      select_parent: new SelectParentCommand(context),
    };

    const keymap = define_keymap({
      "meta+a,ctrl+a": [commands.select_all],
      enter: [commands.break_text_node, commands.insert_default_node],
      "shift+enter": [commands.add_new_line, commands.insert_default_node],
      "meta+z,ctrl+z": [commands.undo],
      "meta+shift+z,ctrl+shift+z": [commands.redo],
      escape: [commands.select_parent],
    });

    return { commands, keymap };
  },
  inserters: {
    paragraph: (
      tr: {
        create: (node: Record<string, unknown>) => void;
        insert_nodes: (ids: string[]) => void;
        selection: { path: Array<string | number>; focus_offset: number };
        set_selection: (sel: Record<string, unknown>) => void;
      },
      content = { content: "", marks: [], annotations: [] },
    ) => {
      const id = sessionConfig.generate_id();
      tr.create({ id, type: "paragraph", content });
      tr.insert_nodes([id]);
      tr.set_selection({
        type: "text",
        path: [...tr.selection.path, tr.selection.focus_offset - 1, "content"],
        anchor_offset: 0,
        focus_offset: 0,
      });
    },
  },
};

/** Creates a Svedit session from a page document. */
export function createSiteSveditSession(document: SveditDocument): Session {
  const doc = fill_document_defaults(
    document as Parameters<typeof fill_document_defaults>[0],
    sitePageDocumentSchema,
  );
  return new Session(sitePageDocumentSchema, doc, sessionConfig) as unknown as Session;
}
