/**
 * @file src/widgets/core/RichText/tiptap.ts
 * @description Tiptap Editor Configuration with dynamic imports for SSR compatibility.
 */

/**
 * Creates a pre-configured Tiptap editor instance.
 * @param element The HTML element to bind the editor to.
 * @param content The initial HTML content for the editor.
 * @param language The current language code (e.g., 'en', 'ar') for text direction.
 * @param options Additional options for the editor.
 */
export async function createEditor(
  element: HTMLElement,
  content: string,
  language: string,
  options: {
    aiEnabled?: boolean;
    collaboration?: { doc: any; field: string };
  } = {},
) {
  // Dynamically import all Tiptap modules only when needed (client-side)
  const [
    { Editor, Extension },
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
    { StarterKit },
    { getTextDirection },
    { ImageResize },
    { TextStyleExtension: TextStyle },
    { Collaboration },
  ] = await Promise.all([
    import("@tiptap/core"),
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
    import("@tiptap/starter-kit"),
    import("@utils/utils"),
    import("./extensions/image-resize"),
    import("./extensions/text-style"),
    import("@tiptap/extension-collaboration"),
  ]);

  const extensions = [
    StarterKit.configure({
      link: false,
      underline: false,
      history: !options.collaboration, // Collaboration extension handles history internally
    }),
    TextStyle, // Custom extension for font-size
    FontFamily,
    Color,
    ImageResize, // Custom Image extension
    Underline,
    Link.configure({
      openOnClick: false,
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
      defaultAlignment:
        language === "ar" || language === "he" || language === "fa" ? "right" : "left",
    }),
    Youtube.configure({
      modestBranding: true,
      HTMLAttributes: {
        class: "w-full aspect-video",
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
  }

  // All extensions are now configured here.
  return new Editor({
    element,
    extensions,
    content: options.collaboration ? undefined : content, // Yjs provides content if collab is on
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert max-w-none focus:outline-none",
        dir: getTextDirection(language), // Set text direction dynamically
      },
    },
  });
}
