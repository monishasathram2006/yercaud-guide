import type pg from "pg";
import { requireRow } from "../../db-errors.js";

/**
 * FR128's "Send Us a Message" — a site-level message to the platform.
 *
 * Not an Enquiry: an Enquiry goes to a Business and requires a Listing
 * (CONTEXT.md). This has neither. It lives in the Content module because it is
 * the Contact page's form, and shares the Content permission with the rest of
 * that page — notably *not* Enquiries, which Business Owners hold and which
 * would let them read messages addressed to the platform.
 */
export type ContactMessageStatus = "sent" | "responded" | "closed";

export interface ContactMessage {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  subject: string;
  phone: string | null;
  message: string;
  consented: boolean;
  status: ContactMessageStatus;
  createdAt: string;
}

interface ContactMessageRow {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  subject: string;
  phone: string | null;
  message: string;
  consented: boolean;
  status: ContactMessageStatus;
  created_at: string;
}

const COLUMNS = `id, user_id, name, email, subject, phone, message, consented, status, created_at`;

function toContactMessage(row: ContactMessageRow): ContactMessage {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    phone: row.phone,
    message: row.message,
    consented: row.consented,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface ContactMessageInput {
  name: string;
  email: string;
  subject: string;
  phone?: string | null;
  message: string;
  consented: boolean;
}

export async function createContactMessage(
  db: pg.Pool,
  input: ContactMessageInput,
  userId: string | null,
): Promise<ContactMessage> {
  const { rows } = await db.query<ContactMessageRow>(
    `INSERT INTO contact_messages (user_id, name, email, subject, phone, message, consented)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [userId, input.name, input.email, input.subject, input.phone ?? null, input.message, input.consented],
  );
  return toContactMessage(rows[0]);
}

export interface ListContactMessagesOptions {
  status?: ContactMessageStatus;
}

export async function listContactMessages(db: pg.Pool, options: ListContactMessagesOptions = {}): Promise<ContactMessage[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // Newest first: an inbox is read from the top.
  const { rows } = await db.query<ContactMessageRow>(
    `SELECT ${COLUMNS} FROM contact_messages ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(toContactMessage);
}

/** Status transitions rather than deletion, per ADR 0010. */
export async function setContactMessageStatus(
  db: pg.Pool,
  id: string,
  status: ContactMessageStatus,
): Promise<ContactMessage> {
  const { rows } = await db.query<ContactMessageRow>(
    `UPDATE contact_messages SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
    [status, id],
  );
  return toContactMessage(requireRow(rows, "Contact message not found"));
}
