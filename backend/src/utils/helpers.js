import crypto from "crypto";

export const uuid = () => crypto.randomUUID();

export const slugify = (value = "") => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

export const pageValues = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query.page_size) || Number(process.env.PAGE_SIZE) || 20, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
};

export const paginated = (rows, count, req, pageSize) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const base = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}`;
  const pages = Math.ceil(count / pageSize);
  return {
    count,
    next: page < pages ? `${base}?page=${page + 1}` : null,
    previous: page > 1 ? `${base}?page=${page - 1}` : null,
    results: rows,
  };
};

export const money = (value) => Number(value || 0).toFixed(2);
