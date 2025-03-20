const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define feedback schema
const feedbackSchema = new mongoose.Schema({
  phoneNumber: String,
  message: String,
  timestamp: Date,
});
const Feedback = mongoose.model("Feedback", feedbackSchema);

app.use(bodyParser.json());

// WhatsApp Webhook Verification
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (req.query["hub.verify_token"] === verifyToken) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// Receive WhatsApp messages
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log(body);
  if (body.object && body.entry) {
    for (let entry of body.entry) {
      for (let change of entry.changes) {
        if (change.value.messages) {
          for (let message of change.value.messages) {
            if (message.type === "text") {
              const phoneNumber = message.from;
              const feedbackMessage = message.text.body;

              // Save feedback to MongoDB
              const feedback = new Feedback({
                phoneNumber,
                message: feedbackMessage,
                timestamp: new Date(),
              });

              await feedback.save();

              // Send acknowledgment
              await sendWhatsAppMessage(phoneNumber, "Thank you for your feedback!");

              console.log(`Feedback received: ${feedbackMessage} from ${phoneNumber}`);
            }
          }
        }
      }
    }
  }

  res.sendStatus(200);
});

// Send WhatsApp message function
async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    text: { body: message },
  };

  try {
    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error sending WhatsApp message:", error.response ? error.response.data : error);
  }
}

// New function to send feedback request
async function sendFeedbackRequest(to) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "service_feedback_request",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Sneaklin" },  // {{1}} - Business name
            { type: "text", text: "shoe care service" },  // {{2}} - Product/service
            { type: "text", text: "short survey" },  // {{3}} - Feedback form type
            { type: "text", text: "recent order" },  // {{4}} - Experience type
            {
              type: "BUTTON",
              sub_type: "flow", "index": "0",
              parameters: [{ "type": "action", "action": {} }]
            }

          ]
        }
      ]
    }
  };

  try {
    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`Feedback request sent to ${to}`);
  } catch (error) {
    console.error("Error sending feedback request:", error.response ? error.response.data : error);
  }
}

// New route to trigger feedback request
app.post("/send-feedback-request", async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  try {
    await sendFeedbackRequest(phoneNumber);
    res.status(200).json({ message: "Feedback request sent successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send feedback request" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});