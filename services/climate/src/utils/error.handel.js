export const errorRes = ({ msg = "Error", code = "SERVICE_UNAVAILABLE", statusCode = 500, options }) => {
  throw new Error(msg, {
    cause: { code, statusCode, options },
  });
};

export const errorHandler = (error, _req, res, _next) => {
  const statusCode = error?.cause?.statusCode || (error?.type === "entity.parse.failed" ? 400 : 500);
  const code = error?.cause?.code || (error?.type === "entity.parse.failed" ? "INVALID_INPUT" : "SERVICE_UNAVAILABLE");
  const message = error?.type === "entity.parse.failed"
    ? "Request body must contain valid JSON."
    : error?.cause?.code ? error.message : "The climate service could not complete the request.";
  return res.status(statusCode).json({ error: { code, message } });
};




