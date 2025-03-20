require('dotenv').config();
const { MongoClient } = require('mongodb');
const { Parser } = require('json2csv');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI; // Store your MongoDB connection string in a .env file
const DB_NAME = "care"; // Change this to your actual DB name

(async () => {
    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const ordersCollection = db.collection('orders');
        const customersCollection = db.collection('customers');

        // Get last year range
        const now = new Date();
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);

        // Fetch orders from last year
        const orders = await ordersCollection.aggregate([
            {
                $match: {
                    "status": { $nin: ["cancelled", "draft"] },
                    "createdAt": { $gte: lastYearStart, $lte: lastYearEnd }
                }
            },
            {
                $group: {
                    _id: "$customerId",
                    totalOrders: { $sum: 1 },
                    totalPairs: {
                        $sum: {
                            $sum: {
                                $map: {
                                    input: { $objectToArray: "$services" }, // Convert object to array
                                    as: "service",
                                    in: { $toInt: "$$service.v" } // Ensure numeric conversion
                                }
                            }
                        }
                    }
                }
            }
        ]).toArray();
        console.log(`Orders found: ${orders.length}`);
        // Fetch customer details
        const customerIds = orders.map(order => order._id);
        const customers = await customersCollection.find({ _id: { $in: customerIds } }).toArray();

        // Merge customer data
        const data = orders.map(order => {
            const customer = customers.find(c => c._id.equals(order._id)) || {};
            return {
                customerId: order._id,
                firstName: customer.first_name || "",
                lastName: customer.last_name || "",
                phone: customer.phone || "",
                totalOrders: order.totalOrders,
                totalPairs: order.totalPairs
            };
        });

        // Convert to CSV
        const csvParser = new Parser({ fields: ["customerId", "firstName", "lastName", "phone", "totalOrders", "totalPairs"] });
        const csvData = csvParser.parse(data);

        // Save CSV file
        fs.writeFileSync("customer_orders_last_year.csv", csvData);
        console.log("CSV file saved: customer_orders_last_year.csv");

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
})();