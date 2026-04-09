/**
 * @file src/widgets/core/RichText/tiptap.ts
 * @description Tiptap Editor Configuration with dynamic imports for SSR compatibility.
 */

import type { Editor } from "@tiptap/core";

export interface CollaborationOptions {
  doc: any; // Y.Doc
  field: string;
  awareness?: any; // Yjs Awareness
  user?: { name: string; color: string; [key: string]: any };
}

export interface CreateEditorOptions {
  aiEnabled?: boolean;
  collaboration?: CollaborationOptions;
  /** Additional custom extensions */
  extensions?: any[];
  /** Extra editor props */
  editorProps?: any;
}

/**
 * Creates a pre-configured Tiptap editor instance.
 */
export async function createEditor(
  element: HTMLElement,
  content: string,
  language: string = "en",
  options: CreateEditorOptions = {},
): Promise<Editor> {
  // Dynamically import all Tiptap modules only when needed (client-side)
  const [
    { Editor, Extension },
    { StarterKit },
    { CharacterCount },
    { Color },
    { FontFamily },
    { Link },
    { Placeholder },
    { Table },
    { TableCell },
    { TableHeader },
    { TableRow },
    { TextAlign },
    { Underline },
    { Youtube },
    { getTextDirection },
    { ImageResize },
    { TextStyleExtension: TextStyle },
    { Collaboration },
    { CollaborationCursor },
  ] = await Promise.all([
    import("@tiptap/core"),
    import("@tiptap/starter-kit"),
    import("@tiptap/extension-character-count"),
    import("@tiptap/extension-color"),
    import("@tiptap/extension-font-family"),
    import("@tiptap/extension-link"),
    import("@tiptap/extension-placeholder"),
    import("@tiptap/extension-table"),
    import("@tiptap/extension-table-cell"),
    import("@tiptap/extension-table-header"),
    import("@tiptap/extension-table-row"),
    import("@tiptap/extension-text-align"),
    import("@tiptap/extension-underline"),
    import("@tiptap/extension-youtube"),
    import("@utils/utils"),
    import("./extensions/image-resize"),
    import("./extensions/text-style"),
    import("@tiptap/extension-collaboration"),
    import("@tiptap/extension-collaboration-cursor"),
  ]);

  const extensions: any[] = [
    StarterKit.configure({
      link: false,
      underline: false,
      history: !options.collaboration, // Collaboration extension handles history internally
    }),
    TextStyle,
    FontFamily,
    Color,
    ImageResize,
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
    Placeholder.configure({
      placeholder: ({ node }: any) => {
        if (node.type.name === "heading") {
          return "Write a heading…";
        }
        return "Start writing your awesome content…";
      },
      includeChildren: true,
      emptyEditorClass: "is-editor-empty",
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    TextAlign.configure({
      types: ["heading", "paragraph", "image"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: ["ar", "he", "fa"].includes(language) ? "right" : "left",
    }),
    Youtube.configure({
      modestBranding: true,
      HTMLAttributes: {
        class: "w-full aspect-video rounded-lg",
      },
    }),
    CharacterCount,
    // Custom extension for the Tab key
    Extension.create({
      name: "Tab",
      addKeyboardShortcuts() {
        return {
          Tab: ({ editor: e }: any) => e.commands.insertContent("\t"),
        };
      },
    }),
  ];

  if (options.collaboration) {
    extensions.push(
      Collaboration.configure({
        document: options.collaboration.doc,
        field: options.collaboration.field,
      }),
    );

    if (options.collaboration.awareness) {
      extensions.push(
        CollaborationCursor.configure({
          awareness: options.collaboration.awareness,
          user: options.collaboration.user || { name: "Anonymous", color: "#3b82f6" },
        }),
      );
    }
  }

  // Inject additional custom extensions if provided
  if (options.extensions?.length) {
    extensions.push(...options.extensions);
  }

  return new Editor({
    element,
    extensions,
    content: options.collaboration ? undefined : content,
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert max-w-none focus:outline-none min-h-[200px]",
        dir: getTextDirection(language),
        spellcheck: "true",
      },
      ...options.editorProps,
    },
    // Performance: reduce unnecessary re-renders during high-concurrency sync
    shouldRerenderOnTransaction: false,
  });
}
