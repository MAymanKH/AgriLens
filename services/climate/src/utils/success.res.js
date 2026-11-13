export const successRes = ({ res, status = 200, msg = "done", data = {}, raw = false }) => {
  if (raw) return res.status(status).json(data);
  return res.status(status).json({
    msg,
    data,
    status,
    timeStamp: new Date().toISOString(),
  });
};
