/**
 * Strip HTML/XML to clean plain text, handling Confluence-specific tags.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return '';

  let text = html;

  // Remove Confluence macro tags (ac: and ri: namespaced elements)
  text = text.replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]*>/gi, '');
  text = text.replace(/<ac:[^>]*\/>/gi, '');
  text = text.replace(/<ri:[^>]*>[\s\S]*?<\/ri:[^>]*>/gi, '');
  text = text.replace(/<ri:[^>]*\/>/gi, '');

  // Replace <br> variants with newline
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Replace block-level tags with newline
  text = text.replace(/<\/(p|li|h[1-6]|td|th|tr|div|blockquote)>/gi, '\n');
  text = text.replace(/<(p|li|h[1-6]|td|th|tr|div|blockquote)[^>]*>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Normalize whitespace: collapse multiple spaces/tabs to single space
  text = text.replace(/[ \t]+/g, ' ');

  // Normalize multiple newlines to max 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // Filter empty lines and trim each line
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  return lines.join('\n');
}

/**
 * Extract all tasks from Confluence storage-format HTML.
 * @param {string} html
 * @returns {Array<{id: string, status: string, body: string}>}
 */
export function extractTasks(html) {
  if (!html) return [];

  const tasks = [];
  // Match each <ac:task>...</ac:task> block
  const taskRegex = /<ac:task>([\s\S]*?)<\/ac:task>/gi;
  let taskMatch;

  while ((taskMatch = taskRegex.exec(html)) !== null) {
    const taskBlock = taskMatch[1];

    const idMatch = taskBlock.match(/<ac:task-id>([\s\S]*?)<\/ac:task-id>/i);
    const statusMatch = taskBlock.match(/<ac:task-status>([\s\S]*?)<\/ac:task-status>/i);
    const bodyMatch = taskBlock.match(/<ac:task-body>([\s\S]*?)<\/ac:task-body>/i);

    const id = idMatch ? idMatch[1].trim() : '';
    const status = statusMatch ? statusMatch[1].trim() : 'incomplete';
    const bodyHtml = bodyMatch ? bodyMatch[1] : '';
    const body = stripHtml(bodyHtml);

    tasks.push({ id, status, body });
  }

  return tasks;
}

/**
 * Extract sections (headings and their content) from HTML.
 * @param {string} html
 * @returns {Array<{heading: string, content: string}>}
 */
export function extractSections(html) {
  if (!html) return [];

  const sections = [];
  // Split on heading tags
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  const headings = [];
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      text: stripHtml(match[2]),
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const start = heading.endIndex;
    const end = i + 1 < headings.length ? headings[i + 1].index : html.length;
    const contentHtml = html.slice(start, end);
    const content = stripHtml(contentHtml);
    sections.push({ heading: heading.text, content });
  }

  return sections;
}
