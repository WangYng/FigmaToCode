const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Encode raw text once, at the point where it is inserted into HTML. */
export const escapeHTML = (text: string): string =>
  text.replace(/[&<>"']/g, (character) => entities[character]);
