import { del, get, patch, post } from "./client";

export const getCards = () => get("/cards");

export const addCard = (name) => post("/cards", { name });

export const updateCard = (id, name) => patch(`/cards/${id}`, { name });

export const deleteCard = (id) => del(`/cards/${id}`);
