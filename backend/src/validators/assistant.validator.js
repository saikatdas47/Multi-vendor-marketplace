export const askDto = {
  message: { required: true, type: "string", trim: true, minLength: 2, maxLength: 1000 },
  session_id: { type: "string", trim: true, maxLength: 100 },
};

export const messageDto = {
  body: { required: true, type: "string", trim: true, minLength: 1, maxLength: 4000 },
};

export const noticeDto = {
  subject: { required: true, type: "string", trim: true, minLength: 2, maxLength: 160 },
  body: { required: true, type: "string", trim: true, minLength: 2, maxLength: 10000 },
  audience: { type: "string", oneOf: ["selected", "all"] },
  seller_ids: { type: "array" },
};
