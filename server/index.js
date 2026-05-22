import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

console.log("Server Starting...");
console.log("Firebase Mode Enabled");
console.log("MongoDB Removed Successfully");

app.get('/', (req, res) => {
  res.send('AquaChat Firebase Backend Running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
