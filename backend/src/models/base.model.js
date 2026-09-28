import { query } from "../db/index.js";

export const findOne = async (sql, values = []) => {
  const result = await query(sql, values);
  return result.rows[0] || null;
};

export const findMany = async (sql, values = []) => {
  const result = await query(sql, values);
  return result.rows;
};

export const run = async (sql, values = []) => query(sql, values);
