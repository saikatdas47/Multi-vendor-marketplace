import { query, transaction } from "../db/index.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { emitMessage } from "../socket.js";

const getSellerProfile = async (userId) => {
  const seller = (await query("SELECT * FROM seller_profiles WHERE user_id=$1", [userId])).rows[0];
  if (!seller) throw new ApiError(404, "Seller profile not found.");
  return seller;
};

const getThread = async (conversationId) => {
  const conversation = (await query(
    `SELECT c.*,s.shop_name,s.slug,s.id AS seller_profile_id,s.id AS seller_id,u.email AS seller_email
     FROM conversations c JOIN seller_profiles s ON s.id=c.seller_id
     JOIN users u ON u.id=s.user_id WHERE c.id=$1`,
    [conversationId],
  )).rows[0];
  if (!conversation) return null;
  conversation.messages = (await query(
    "SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at",
    [conversationId],
  )).rows;
  return conversation;
};

const ensureThread = async (sellerId) => {
  const result = await query(
    `INSERT INTO conversations(seller_id) VALUES($1)
     ON CONFLICT(seller_id) DO UPDATE SET updated_at=conversations.updated_at RETURNING id`,
    [sellerId],
  );
  return result.rows[0].id;
};

export const sellerNotices = asyncHandler(async (req, res) => {
  const seller = await getSellerProfile(req.user.id);
  const rows = await query(
    `SELECT nr.id,nr.read_at,(nr.read_at IS NOT NULL) AS is_read,n.id AS notice_id,
            n.subject,n.body,n.audience,n.created_at
     FROM notice_recipients nr JOIN admin_notices n ON n.id=nr.notice_id
     WHERE nr.seller_id=$1 ORDER BY n.created_at DESC`,
    [seller.id],
  );
  res.json({ count: rows.rowCount, next: null, previous: null, results: rows.rows });
});

export const sellerNoticeUnread = asyncHandler(async (req, res) => {
  const seller = await getSellerProfile(req.user.id);
  const row = await query("SELECT COUNT(*)::int AS count FROM notice_recipients WHERE seller_id=$1 AND read_at IS NULL", [seller.id]);
  res.json(row.rows[0]);
});

export const markNotice = asyncHandler(async (req, res) => {
  const seller = await getSellerProfile(req.user.id);
  const row = await query("UPDATE notice_recipients SET read_at=NOW() WHERE id=$1 AND seller_id=$2 RETURNING *", [req.params.id, seller.id]);
  if (!row.rowCount) throw new ApiError(404, "Notice not found.");
  res.json(row.rows[0]);
});

export const markAllNotices = asyncHandler(async (req, res) => {
  const seller = await getSellerProfile(req.user.id);
  await query("UPDATE notice_recipients SET read_at=NOW() WHERE seller_id=$1 AND read_at IS NULL", [seller.id]);
  res.json({ detail: "All notices marked as read." });
});

export const adminNotices = asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT n.*,(SELECT COUNT(*)::int FROM notice_recipients WHERE notice_id=n.id) AS recipient_count
     FROM admin_notices n ORDER BY created_at DESC`,
  );
  res.json({ count: rows.rowCount, next: null, previous: null, results: rows.rows });
});

export const sendNotice = asyncHandler(async (req, res) => {
  const body = req.body;
  const notice = await transaction(async (client) => {
    const made = await client.query(
      "INSERT INTO admin_notices(author_id,subject,body,audience) VALUES($1,$2,$3,$4) RETURNING *",
      [req.user.id, body.subject, body.body, body.audience || "selected"],
    );
    let sellerIds = body.seller_ids || [];
    if ((body.audience || "selected") === "all") {
      sellerIds = (await client.query("SELECT id FROM seller_profiles WHERE status='approved'")).rows.map((seller) => seller.id);
    }
    for (const sellerId of sellerIds) {
      await client.query(
        "INSERT INTO notice_recipients(notice_id,seller_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [made.rows[0].id, sellerId],
      );
    }
    return made.rows[0];
  });
  res.status(201).json(notice);
});

export const sellerThread = asyncHandler(async (req, res) => {
  const seller = await getSellerProfile(req.user.id);
  const conversationId = await ensureThread(seller.id);
  await query("UPDATE conversations SET seller_unread=0 WHERE id=$1", [conversationId]);
  res.json(await getThread(conversationId));
});

export const sellerReply = asyncHandler(async (req, res) => {
  const seller = await getSellerProfile(req.user.id);
  const conversationId = await ensureThread(seller.id);
  const made = await query(
    "INSERT INTO messages(conversation_id,sender_id,side,body) VALUES($1,$2,'seller',$3) RETURNING *",
    [conversationId, req.user.id, req.body.body],
  );
  await query(
    "UPDATE conversations SET admin_unread=admin_unread+1,last_message_at=NOW(),updated_at=NOW() WHERE id=$1",
    [conversationId],
  );
  emitMessage(seller.id, { conversation_id: conversationId, seller_id: seller.id, message: made.rows[0] });
  res.status(201).json(await getThread(conversationId));
});

export const sellerThreadUnread = asyncHandler(async (req, res) => {
  const seller = await getSellerProfile(req.user.id);
  const row = await query("SELECT COALESCE(seller_unread,0)::int AS count FROM conversations WHERE seller_id=$1", [seller.id]);
  res.json(row.rows[0] || { count: 0 });
});

export const adminThreads = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === "1";
  const rows = await query(
    `SELECT c.*,s.shop_name,s.slug,s.id AS seller_profile_id,s.id AS seller_id,u.email AS seller_email,
       (SELECT json_build_object('side',m.side,'body',m.body) FROM messages m
        WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS preview
     FROM conversations c JOIN seller_profiles s ON s.id=c.seller_id
     JOIN users u ON u.id=s.user_id WHERE ($1::boolean=FALSE OR c.admin_unread>0)
     ORDER BY last_message_at DESC`,
    [unreadOnly],
  );
  res.json({ count: rows.rowCount, next: null, previous: null, results: rows.rows });
});

export const adminThread = asyncHandler(async (req, res) => {
  const data = await getThread(req.params.id);
  if (!data) throw new ApiError(404, "Conversation not found.");
  await query("UPDATE conversations SET admin_unread=0 WHERE id=$1", [req.params.id]);
  res.json(data);
});

export const adminUnread = asyncHandler(async (_req, res) => {
  const row = await query("SELECT COALESCE(SUM(admin_unread),0)::int AS count FROM conversations");
  res.json(row.rows[0]);
});

export const adminMessage = asyncHandler(async (req, res) => {
  const sellerId = Number(req.params.sellerId);
  const sellerExists = await query("SELECT id FROM seller_profiles WHERE id=$1", [sellerId]);
  if (!sellerExists.rowCount) throw new ApiError(404, "Seller not found.");
  const conversationId = await ensureThread(sellerId);
  const made = await query(
    "INSERT INTO messages(conversation_id,sender_id,side,body) VALUES($1,$2,'admin',$3) RETURNING *",
    [conversationId, req.user.id, req.body.body],
  );
  await query(
    "UPDATE conversations SET seller_unread=seller_unread+1,last_message_at=NOW(),updated_at=NOW() WHERE id=$1",
    [conversationId],
  );
  emitMessage(sellerId, { conversation_id: conversationId, seller_id: sellerId, message: made.rows[0] });
  res.status(201).json(await getThread(conversationId));
});
