const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Grab the token from the network request header
  const token = req.header('x-auth-token');
  
  if (!token) {
    return res.status(401).json({ message: "No passport found. Authorization denied." });
  }

  try {
    // Verify the token using your secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach the userId to the request
    next(); // Pass them through the checkpoint
  } catch (err) {
    res.status(401).json({ message: "Passport is invalid or expired." });
  }
};