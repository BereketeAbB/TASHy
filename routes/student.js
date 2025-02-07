const router = require("express").Router()
const path = require("path")

const {
	isEmail, 
	isValidInitData,
    isValidDiagnosis
} = require("../util/validator")

const { Student } = require("../menu/student")

const { studMenu } = require('./../botRoutes/stud')
const { sendEmail } = require("../util/email")
const { createToken, verifyToken } = require("../util/jwt");

(!process.env.NODE_ENV ||
    process.env.NODE_ENV !== "production") && 
    require("dotenv").config()


router.get("/login", async (req, res) => {
	res.render(path.join('stud', 'login'))
})

router.get("/signup", async (req, res) => {
	res.render(path.join('stud', 'signup'))
})

router.get("/verify", async (req, res) => {
	res.render(path.join('stud', 'verify'))
})

router.get("/send-request", async (req, res) => {
    res.render(path.join('stud', 'send-request'))
})



router.post("/login", async (req, res) => {
	const { email, initData } = req.body
    const { db } = res.locals

	if (!isEmail(email)) {
		res.status(400).json({
			status: "error",
			result: "Invalid email : email should look like eg. example@example.com",
		});
		return;
	}

	db.checkStudent(email, (result) => {
        console.log(result);
		if (result.status) {
			sendEmail(
				result.email,
				token = createToken(
					result.email,
					result._id,
					process.env.USER_ROLE
				),
				(isSuccess) => {
					if (isSuccess){
						res.status(200).json({
							status: "success",
							result: {
								msg: "You should receive an email, with a verification token.",
							},
						});
					}
					else
						res.status(500).json({
							status: "error",
							result: {
								msg: "Could not send an email.",
							},
						});
				}
			);
		} else
			res.status(401).json({
				status: "unauthorized",
				result: {
                    msg: result.msg
                },
			});
	})
})

router.post("/verify", async (req, res) => {
    const { token, initData} = req.body;
    const { db, bot } = res.locals

	if(!token || !isValidInitData(initData)){
		res.status(401).json({
			status: "error",
			result: {
				msg: "Not a valid request."
			}
		})
		return;
	}

	const decodedUrlParams = new URLSearchParams(initData);
	const userId = JSON.parse(decodedUrlParams.get("user")).id;
	const fName = JSON.parse(decodedUrlParams.get("user")).first_name;

    try {
		verifyToken(token, (err, decodedToken) => {
			if (
				err ||
				!decodedToken.hasOwnProperty("id") ||
				!decodedToken.hasOwnProperty("email") ||
				!decodedToken.hasOwnProperty("role") ||
				decodedToken.role !== process.env.USER_ROLE
			) {
				res.status(403).json({
					status: "unauthorized",
					result: { msg: "Invalid token, please try again" },
				});
			} else {       
                db.addSession(`${userId}:${userId}`, {
                    token : `${token}`,
                    role : decodedToken.role
                }, (retVal) => {
                    if (retVal && retVal.status) {
                        res.json({
                            status: "success",
                            result: {
                                msg: "Authenticated successfully."
                            },
                        })
                        
                        let student = new Student(bot);
                        student.home(userId, fName);
                    }else if (retVal && !retVal.status) {
                        res.status(401).json({
                            status: "error",
                            result: {
                                msg: "Couldn't set a session."
                            }
                        })
                    }
                })
			}
		})
	} catch (error) {
        console.log(error)
		res.status(400).json({ status: "error" });
	}
})

router.post("/signup", async (req, res) => {
    const { 
		stud_id, f_name, m_name, l_name,
		email, phone_no, ed_info, 
        diagnosis, initData
	} = req.body
    
    const { db } = res.locals
	
        
    if (!isValidInitData(initData))
    {
        res.status(401).json({
            status: "error",
            result: {
                msg: "Not a valid request."
            }
        })
		return;
	}
    
    const decodedUrlParams = new URLSearchParams(initData);
    const userId = JSON.parse(decodedUrlParams.get("user")).id;

    db.addStudent(
        stud_id, f_name, l_name, m_name,
		email, phone_no, userId,
		ed_info, diagnosis,
        (result) => {
            if (result.status) {
                db.checkStudent(email, (result) => {
                    if (result.status) {
                        sendEmail(
                            result.email,
                            createToken(
								result.email,
								result._id,
								process.env.USER_ROLE
							),
                            (isSuccess) => {
                                console.log(isSuccess)
                                if (isSuccess)
                                    res.status(200).json({
                                        status: "success",
                                        result: {
                                            msg: "You should receive an email, with a verification token.",
                                        },
                                    });
                                else
                                    res.status(500).json({
                                        status: "error",
                                        result: {
                                            msg : result.msg,
                                            err: result.err.message
                                        }
                                    })
                                    
                            }
                        )
                    } else 
                        res.status(401).json({
                            status: "error",
                            result: result.err,
                        });
                    
                });
            } else {
                res.status(400).json({
                    status: "error",
                    result: {
                        msg:
                            result.err.code === 11000
                                ? "Email or your telegram ID already exists."
                                : "Error in adding a user to database.",
                        err: result.err,
                    },
                });
            }
        }
    )
})

router.post("/send-request", async (req, res) => {
    const {
        health_team, diagnosis, initData
    } = req.body

    const { db, bot } = res.locals
	
     
    if (!isValidInitData(initData))
    {
        res.status(401).json({
            status: "error",
            result: {
                msg: "Not a valid request."
            }
        })
		return;
	}

    if (!isValidDiagnosis(diagnosis)){
        res.status(401).json({
            status: "error",
            result: {
                msg: "Not a valid request, please provide diagnosis accordingly."
            }
        })
		return;
    }

    const decodedUrlParams = new URLSearchParams(initData);
    const userId = JSON.parse(decodedUrlParams.get("user")).id;

    
    db.addRequest(userId, health_team, undefined, undefined, diagnosis, async (result) => {

        if (result.status){
            requestId = result.data._id
            await db.getStudent(result.data.telegram_id, async studInfo => {
                const spBot = health_team.replace("_health", "")
                
                studMenu.sendServiceProviders(userId, spBot, diagnosis, studInfo.result, requestId)

                let student = new Student(bot);
                await student.notifyAdmin(studInfo, result, db)
                
                res.status(200).json({
                    status: "success",
                    result: {
                        msg: "Your request added successfully."
                    }
                })
            }) 
        }else if (!result.status){
            res.status(501).json({
                status: "error",
                result: {
                    msg: result.msg
                }
            })
        }
    })
})


module.exports = router