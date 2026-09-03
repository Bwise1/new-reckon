/** Comments on BOQ elements and items (docs/comments-plan.md, first release). */

export type CommentAnchorKind = 'boq_element' | 'boq_item';

export interface CommentAuthor {
  id: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
}

export interface CommentMember {
  id: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
  email?: string;
}

export interface CommentEntry {
  clientUuid: string;
  body: string;
  /** User ids @mentioned in the body (tokens `@[Name](u:id)`). */
  mentions?: number[];
  author: CommentAuthor;
  createdAt: string;
  editedAt?: string | null;
  /** True until the sync queue confirms it landed. */
  pending?: boolean;
}

export interface CommentThread {
  clientUuid: string;
  anchorKind: CommentAnchorKind;
  anchorClientUuid: string;
  status: 'open' | 'resolved';
  comments: CommentEntry[];
}

/** Key a thread by its target so the UI looks it up from an element/item id. */
export const commentTargetKey = (kind: CommentAnchorKind, anchorClientUuid: string) =>
  `${kind}:${anchorClientUuid}`;

/** The mention token as stored: `@[Ade Ojo](u:123)`. */
export const MENTION_TOKEN = /@\[([^\]]+)\]\(u:(\d+)\)/g;

/** Split a body into text and mention parts for rendering. */
export const splitMentions = (body: string) => {
  const parts: { type: 'text' | 'mention'; text: string; userId?: number }[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_TOKEN)) {
    if (m.index! > last) parts.push({ type: 'text', text: body.slice(last, m.index) });
    parts.push({ type: 'mention', text: `@${m[1]}`, userId: Number(m[2]) });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push({ type: 'text', text: body.slice(last) });
  return parts;
};
