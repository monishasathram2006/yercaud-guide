// Shared by both Activity and Tour inclusions/exclusions — identical shape
// (item + isIncluded) on both tables, see child-collection.ts.
export const inclusionCreateSchema = {
  body: {
    type: "object",
    required: ["item"],
    properties: {
      item: { type: "string", minLength: 1 },
      isIncluded: { type: "boolean" },
    },
  },
};

export const inclusionUpdateSchema = {
  body: {
    type: "object",
    properties: {
      item: { type: "string", minLength: 1 },
      isIncluded: { type: "boolean" },
    },
  },
};
