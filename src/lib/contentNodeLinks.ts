type ContentNodeLinkInput = {
  id: number;
  slug: string | null;
  node_type: string | null;
};

export function getContentNodeHref(node: ContentNodeLinkInput): string {
  if (node.node_type === 'course') {
    return node.slug ? `/courses/${node.slug}` : `/courses`;
  }

  return node.slug ? `/library/${node.slug}` : `/library/${node.id}`;
}

