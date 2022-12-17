const express = require('express');
var cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const nodemailer = require("nodemailer");
const crypto = require('crypto');

const saltRounds = 10;
const port = process.env.PORT || 5000;

require('dotenv').config()
app = express();
app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.1cmhy5v.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const sendEmail = async (user, resetToken) => {
    let testAccount = await nodemailer.createTestAccount();
    let transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass, // generated ethereal password
        },
    });

    let info = await transporter.sendMail({
        from: '"Fred Foo 👻" <foo@example.com>', // sender address
        to: `${user.email}`, // list of receivers
        subject: "Password Reset", // Subject line
        text: `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n <br/> http://127.0.0.1:5000/reset-pass/${resetToken}`, // plain text body
        html: `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n <br/> http://127.0.0.1:5000/reset-pass/${resetToken}`, // html body
    });
    console.log("Message sent: %s", info.messageId);
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    return {
        "Password Reset Link": `http://127.0.0.1:5000/reset-pass/${resetToken}`,
        "Preview URL": nodemailer.getTestMessageUrl(info)
    }
}

async function run() {
    try {
        const usersCollection = client.db('banaoSocialMedia').collection('users');
        const postsCollection = client.db('banaoSocialMedia').collection('posts');
        app.get('/get-all-post', async (req, res) => {
            const query = {}
            const result = await postsCollection.find(query).toArray();
            res.send(result);
        })
        app.post('/create-user', async (req, res) => {
            console.log(req.body)
            const user = {
                userName: req.body.userName,
                email: req.body.email,
            }
            bcrypt.genSalt(saltRounds, function (err, salt) {
                bcrypt.hash(req.body.password, salt, function (err, hash) {
                    user.password = hash;
                });
            });
            const result = await usersCollection.insertOne(user)
            res.send(result);
        })
        app.put('/reset-pass/:resetToken', async (req, res) => {

            const resetToken = req.params.resetToken;
            const query = {
                resetToken: resetToken,
            }
            const user = await usersCollection.findOne(query)

            if (!user) {
                res.send({ "message": "Invalid reset token" })
            }
            bcrypt.genSalt(saltRounds, function (err, salt) {
                bcrypt.hash(req.body.password, salt, async function (err, hash) {
                    const filter = { _id: user._id }
                    const option = { upsert: true }
                    const updatedUser = {
                        $set: {
                            resetToken: "None",
                            password: hash
                        }
                    }
                    const result = await usersCollection.updateOne(filter, updatedUser, option)
                    res.send(result)
                });
            });

            // const filter = { _id: user._id }
            // const option = { upsert: true }
            // const updatedUser = {
            //     $set: {
            //         resetToken: "None",
            //         password: hash
            //     }
            // }
            // const result = await usersCollection.updateOne(filter, updatedUser, option)
            // res.send(result)
        })
        app.put('/forgot-password', async (req, res) => {
            const email = req.query.email;
            const query = {
                email: email,
            }
            const user = await usersCollection.findOne(query)
            if (!user) {
                res.send({ "message": "Invalid Email" })
            }
            const resetToken = crypto.randomBytes(20).toString('hex');
            const mailURL = await sendEmail(user, resetToken)

            const filter = { email: email }
            const option = { upsert: true }
            const updatedUser = {
                $set: {
                    resetToken: resetToken,
                }
            }
            const result = await usersCollection.updateOne(filter, updatedUser, option)

            if (mailURL) {
                res.send(mailURL);
            }


        })
        app.post('/login', async (req, res) => {
            console.log(req.body)
            const query = {
                email: req.body.email,
            }
            const user = await usersCollection.findOne(query)
            if (!user) {
                res.send({ "message": "Invalid Email" })
            }
            else {
                bcrypt.compare(req.body.password, user?.password, function (err, result) {
                    if (result) {
                        const userInfo = {
                            user: {
                                userName: user.userName,
                                email: user.email
                            }
                        }
                        res.send(userInfo);
                    }
                    else {
                        res.send({ "message": "Invalid password" })
                    }
                });
            }
        })
        app.post('/create-post', async (req, res) => {
            const email = req.query.email
            const post = req.body;
            post.email = email;
            post.comments = []
            post.likes = 0

            console.log(post)
            const result = await postsCollection.insertOne(post)
            res.send(result)
        })
        app.put('/add-likes', async (req, res) => {
            const id = req.query.id;
            console.log(id)
            const query = {
                _id: ObjectId(id)
            }
            const post = await postsCollection.findOne(query)
            console.log(post)
            const newLikeCount = post.likes + 1;
            const filter = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedPost = {
                $set: {
                    likes: newLikeCount,
                }
            }
            const result = await postsCollection.updateOne(filter, updatedPost, option)
            res.send(result)
        })
        app.put('/add-comments', async (req, res) => {
            const id = req.query.id;
            console.log(id)
            const query = {
                _id: ObjectId(id)
            }
            const post = await postsCollection.findOne(query)
            const comments = post.comments
            const comment = req.body
            const newComments = [
                ...post.comments,
                comment
            ]
            console.log(newComments)
            const filter = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedPost = {
                $set: {
                    comments: newComments,
                }
            }
            const result = await postsCollection.updateOne(filter, updatedPost, option)
            res.send(result)
        })
        app.delete('/delete-post', async (req, res) => {
            const id = req.query.id;
            const query = {
                _id: ObjectId(id)
            }
            const result = await postsCollection.deleteOne(query);
            res.send(result);
        })
    }
    catch {

    }
}
run().catch(err => console.error(err));


app.get('/', (req, res) => {
    res.send("Banao MERN Stack Server is running")
})

app.listen(port, () => {
    console.log("Banao MERN Stack Server is running on port " + port)
})