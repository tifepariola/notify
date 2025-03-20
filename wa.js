const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define Feedback Schema
const feedbackSchema = new mongoose.Schema({
  phoneNumber: String,
  name: String,
  recommend: String,
  cleaningQuality: String,
  turnaroundTime: String,
  customerService: String,
  comment: String,
  timestamp: Date,
});

const Feedback = mongoose.model("Feedback", feedbackSchema);

app.use(bodyParser.json());

// Webhook Endpoint
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object === "whatsapp_business_account" && body.entry) {
      for (let entry of body.entry) {
        for (let change of entry.changes) {
          const messageData = change.value.messages?.[0];

          if (messageData?.type === "interactive" && messageData.interactive?.type === "nfm_reply") {
            const senderPhone = messageData.from;
            const senderName = change.value.contacts?.[0]?.profile?.name || "Unknown";
            const responseJson = messageData.interactive.nfm_reply.response_json;

            const surveyResponse = JSON.parse(responseJson);

            // Extract survey data
            const feedbackData = {
              phoneNumber: senderPhone,
              name: senderName,
              recommend: surveyResponse.screen_0_recommend_3 === "0" ? "Yes" : "No",
              cleaningQuality: getQualityLabel(surveyResponse.screen_0_cleaning_quality_0),
              turnaroundTime: getTurnaroundLabel(surveyResponse.screen_0_turnaround_1),
              customerService: getServiceLabel(surveyResponse.screen_0_customer_service_2),
              comment: surveyResponse.screen_0_comment_4 || "No comment",
              timestamp: new Date(),
            };

            // Save feedback to MongoDB
            const feedback = new Feedback(feedbackData);
            await feedback.save();

            console.log(`Feedback saved: ${JSON.stringify(feedbackData, null, 2)}`);

            // Send a confirmation message to the user
            await sendWhatsAppMessage(senderPhone, "Thanks for your feedback! We appreciate your time. 🙌");

            return res.sendStatus(200);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    res.sendStatus(500);
  }
});

// New function to send feedback request
async function sendFeedbackRequest(to) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "feedback_request",
      language: { code: "en" },
      components: [
        // {
        //   type: "body",
        //   parameters: [
        //     { type: "text", text: "Sneaklin" },  // {{1}} - Business name
        //     { type: "text", text: "shoe care service" },  // {{2}} - Product/service
        //     { type: "text", text: "short survey" },  // {{3}} - Feedback form type
        //     { type: "text", text: "recent order" },  // {{4}} - Experience type
        //   ]
        // },
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [{ "type": "action", "action": {} }]
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

// Helper Functions for Labels
function getQualityLabel(value) {
  const labels = {
    "1": "Very Satisfied 🎉",
    "2": "Satisfied 😊",
    "3": "Neutral 😐",
    "4": "Unsatisfied 😕",
  };
  return labels[value] || "Unknown";
}

function getTurnaroundLabel(value) {
  const labels = {
    "1": "🚀 Faster than expected",
    "2": "⏳ Just right",
    "3": "🐢 Took too long",
  };
  return labels[value] || "Unknown";
}

function getServiceLabel(value) {
  const labels = {
    "1": "Friendly & Helpful 😊",
    "2": "Okay, but can improve 🤔",
    "3": "Not Satisfied 😡",
  };
  return labels[value] || "Unknown";
}

// Send WhatsApp Message Function
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
    console.error("Error sending WhatsApp message:", error.response?.data || error);
  }
}

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});