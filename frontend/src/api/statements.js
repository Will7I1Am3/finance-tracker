import { del, get, patch, post, postForm } from "./client";

export const getStatements = (cardName) =>
  get(`/statements${cardName ? `?card_name=${encodeURIComponent(cardName)}` : ""}`);

export const getStatement = (id) => get(`/statements/${id}`);

export const uploadStatement = (formData) => postForm("/statements/upload", formData);

export const saveStatement = (body) => post("/statements", body);

export const updateStatement = (id, body) => patch(`/statements/${id}`, body);

export const deleteStatement = (id) => del(`/statements/${id}`);

export const getUploadUsage = () => get("/statements/usage");
