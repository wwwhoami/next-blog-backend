import remarkParse from 'remark-parse';
import { unified } from 'unified';

const markdown = unified().use(remarkParse);

/**
 * Extracts image destinations from the Markdown syntax tree. Inline image
 * destinations appear first, followed by one destination per referenced image
 * identifier, using its first definition. Fenced and inline code are treated
 * as text.
 *
 * @param content - Markdown source to inspect.
 * @returns Image destinations and syntax flags for caller validation. `hasHtml`
 * marks raw HTML nodes. `hasReferenceSyntax` marks image reference nodes or
 * any link definition, including definitions used by ordinary links.
 */
export function markdownImages(content: string) {
  const urls: string[] = [];
  const references = new Set<string>();
  const definitions = new Map<string, string>();
  let hasHtml = false;
  let hasReferenceSyntax = false;

  const visit = (
    node: ReturnType<typeof markdown.parse>['children'][number],
  ) => {
    switch (node.type) {
      case 'image':
        urls.push(node.url);
        break;
      case 'imageReference':
        hasReferenceSyntax = true;
        references.add(node.identifier);
        break;
      case 'definition':
        hasReferenceSyntax = true;
        if (!definitions.has(node.identifier))
          definitions.set(node.identifier, node.url);
        break;
      case 'html':
        hasHtml = true;
        break;
    }
    if ('children' in node) node.children.forEach(visit);
  };
  markdown.parse(content).children.forEach(visit);

  for (const identifier of references) {
    const url = definitions.get(identifier);
    if (url !== undefined) urls.push(url);
  }

  return { urls, hasHtml, hasReferenceSyntax };
}
