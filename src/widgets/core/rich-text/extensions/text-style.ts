/**
@file src/widgets/core/RichText/extensions/TextStyle.ts
@description - RichText TipTap widget text style extension with fixed font size handling
*/

// TipTap v3 exports TextStyle as a named export (no default)
import { TextStyle } from "@tiptap/extension-text-style";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      // Set the font size
      setFontSize: (size: string) => ReturnType;
      // Unset the font size
      unsetFontSize: () => ReturnType;
    };
  }
}

export default TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const fontSize = element.style.fontSize;
          if (!fontSize) {
            return null;
          }
          return fontSize.replace(/px$/, "");
        },
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.fontSize) {
            return {};
          }
          return {
            style: `font-size: ${attributes.fontSize}`,
          };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize:
        (fontSize: string) =>
        ({ chain }: { chain: any }) => {
          // SECURITY: Sanitize font-size to prevent CSS injection
          const sanitized = fontSize.replace(/[^\w\d.%-]/g, "");
          return chain().setMark("textStyle", { fontSize: sanitized }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }: { chain: any }) => {
          return chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
        },
    };
  },
});
