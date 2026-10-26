/** Minimalny zamiennik @dicebear/core dla skopiowanych komponentów DiceBear (Pixel Art). */
export type ColorPickCollection = Record<string, string>;
export type ComponentPickCollection = Record<string, unknown>;
export type ComponentGroup = Record<string, (components: ComponentPickCollection, colors: ColorPickCollection) => string>;

export const escape = {
  xml: (content: string) =>
    content.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
};
