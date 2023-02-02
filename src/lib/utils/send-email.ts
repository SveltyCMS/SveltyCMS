// import { SMTP_HOST, SMTP_PORT, SMTP_PASSWORD, SMTP_EMAIL } from '$env/static/private'
// import nodemailer from 'nodemailer'

// async function sendMail(email: string, resetToken: string) {

//     const transporter = nodemailer.createTransport({
//         host: SMTP_HOST,
//         port: SMTP_PORT,
//         secure: false, // true for 465, false for other ports
//         auth: {
//           user: SMTP_EMAIL, // generated ethereal user
//           pass: SMTP_PASSWORD, // generated ethereal password
//         },
//       });

//     const info = await new Promise((resolve, reject) => {
//         transporter.sendMail({
//             from: process.env.SMTP_EMAIL,
//             to: email, // list of receivers
//             subject: "Password reset link for Time Tracker", // Subject line
//             text: `${process.env.SMTP_HOST}/setPassword/accessToken?accessToken=${encodeURI(resetToken)}`, // plain text body
//         }, (err, info) => {
//             if (err) {
//                 reject(err)
//                 console.log({err:err})
//             } else {
//                 resolve(info)
//                 console.log({info: info})
//             }
//         })
//     })
//     return info
// }

// export default sendMail
