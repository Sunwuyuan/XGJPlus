#!/usr/bin/env node

/*
 * Copyright (C) 2025-2025 SunWuyuan <https://github.com/sunwuyuan>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import axios from "axios";
import ProgressBar from "progress";
import readline from "readline";
import qrcode from "qrcode-terminal";
import ExcelJS from "exceljs";
import UserAgent from "user-agents";
import { existsSync, readFileSync } from "fs";

const CACHE_FILE = "cache.json";

// Cache management functions
function saveCache(data) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save cache:", error);
    return false;
  }
}

function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      const cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
      return cache;
    }
  } catch (error) {
    console.error("Failed to load cache:", error);
  }
  return null;
}

function isTokenValid(cache) {
  if (!cache || !cache.jwttoken || !cache.timestamp) {
    return false;
  }

  // Check if token is less than 24 hours old
  const tokenAge = Date.now() - cache.timestamp;
  return tokenAge < 24 * 60 * 60 * 1000; // 24 hours in milliseconds
}

let imprint = process.env.IMPRINT || "";
let jwttoken = process.env.JWTTOKEN || "";
let versionInfo = null;
let requestConfig = null;

function generateBrowserInfo() {
  const userAgent = new UserAgent();
  const ua = userAgent.data;
  return {
    userAgent: ua.userAgent,
    secChUa: `"${ua.browserName}";v="${ua.browserVersion}", "Not A(Brand";v="99"`,
    secChUaPlatform: `"${ua.platform}"`,
    secChUaMobile: ua.deviceCategory === "mobile" ? "?1" : "?0",
  };
}
const browserInfo = generateBrowserInfo();
console.log(`使用随机浏览器信息：${browserInfo.userAgent}`);
// Headers will be generated for each request
function getHeaders() {
  return {
    accept: "*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "app-info": versionInfo?.appInfo || "1/3.3.7/814",
    "cache-control": "no-cache",
    "content-type": "application/json; charset=utf-8",
    "sec-ch-ua": browserInfo.secChUa,
    "sec-ch-ua-mobile": browserInfo.secChUaMobile,
    "sec-ch-ua-platform": browserInfo.secChUaPlatform,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent": browserInfo.userAgent,
    referer: "https://service.banjixiaoguanjia.com/",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

async function fetchVersionInfo() {
  try {
    const response = await axios.get(
      "https://service.banjixiaoguanjia.com/appweb/version.json"
    );
    const { version, build_number } = response.data;
    versionInfo = {
      appInfo: `1/${version}/${build_number}`,
      appVcode: build_number,
      appVname: version,
    };
    console.log(`请求版本信息成功：${versionInfo.appInfo}`);
    return versionInfo;
  } catch (error) {
    console.error("Failed to fetch version info:", error);
    // Fallback to default values if API fails
    versionInfo = {
      appInfo: "1/3.3.7/814",
      appVcode: "814",
      appVname: "3.3.7",
    };
    console.log(`请求版本信息失败，使用默认值：${versionInfo.appInfo}`);
    return versionInfo;
  }
}

function initRequestConfig() {
  requestConfig = {
    channel: "app_web",
    platform: "app",
    app_info: {
      app_vcode: versionInfo.appVcode,
      app_vname: versionInfo.appVname,
    },
    device_info: {
      os_name: null,
      os_version: null,
      brand: null,
      model: null,
      screen_height: null,
      screen_width: null,
      device_id: null,
      network_type: "WiFi",
    },
  };
}

async function getQrCode() {
  const response = await axios.post(
    "https://b.welife001.com/app/auth/getQrCodeImg",
    {
      ...requestConfig,
    },
    { headers: getHeaders() }
  );
  return response.data;
}

async function checkLoginStatus(random) {
  const response = await axios.post(
    "https://b.welife001.com/app/auth/checkLoginStatusWithToken",
    {
      random,
      ...requestConfig,
    },
    { headers: getHeaders() }
  );
  return response.data;
}

async function login() {
  const qrCodeData = await getQrCode();
  console.log("请扫描以下二维码登录：");
  console.log("或者在浏览器中打开以下链接：");
  console.log(
    `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${qrCodeData.data.ticket}`
  );

  qrcode.generate(
    `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${qrCodeData.data.ticket}`,
    { small: true }
  );

  let loginStatus = { code: 0, msg: "未扫码" };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (loginStatus.code !== 1) {
    await new Promise((resolve) => {
      rl.question("按回车键尝试登录...", async () => {
        loginStatus = await checkLoginStatus(qrCodeData.data.random);
        if (loginStatus.code === 1) {
          console.log("登录成功！");
          jwttoken = loginStatus.data;
          // Save cache after successful login
          saveCache({
            jwttoken,
            imprint,
            timestamp: Date.now(),
          });
          resolve();
        } else if (loginStatus.msg !== "未扫码") {
          console.error("登录失败：", loginStatus.msg);
          process.exit(1);
        } else {
          console.log("等待扫码...");
          resolve();
        }
      });
    });
  }

  rl.close();
}

async function getUserChildInfo() {
  const response = await axios.post(
    "https://b.welife001.com/applet/getUser",
    {},
    {
      headers: { ...getHeaders(), authorization: jwttoken },
    }
  );
  //console.log(response.data.data.currentUser.child_class_list);
  return response.data.data.currentUser.child_class_list;
}

async function getParentInfo(members) {
  let allData = [];
  let page = 0;
  let hasMoreData = true;

  while (hasMoreData) {
    const response = await axios.get(
      `https://b.welife001.com/info/getParent?members=${members.join(
        "%3A"
      )}&type=-1&date=-1&page=${page}&size=20&isRecent=false`,
      {
        headers: { ...getHeaders(), authorization: jwttoken },
      }
    );

    const pageData = response.data.data;

    if (!pageData || pageData.length === 0) {
      hasMoreData = false;
    } else {
      allData = allData.concat(pageData);
      page++;
    }
  }

  return allData;
}

// 处理不同类型数据的函数
async function processDataByType(data, classMap) {
  console.log(classMap);
  if (data.type === 0) {
    // 班级信息类型
    const membersData = await getClassMembers(data.cls);
    return processClassMemberData(membersData, classMap, data.cls);
  }

  switch (data.type) {
    case 4:
      return processScoreData(data, classMap);
    case 15:
      return processStudentInfoData(data, classMap);
    default:
      console.log(`暂不支持处理类型 ${data.type} 的数据`);
      return null;
  }
}

// 处理成绩数据
async function processScoreData(data, classMap) {
  const studentNames = await getClassById(data.cls);
  const results = [];
  const progressBar = new ProgressBar("[:bar] :percent", {
    complete: "=",
    incomplete: " ",
    width: 20,
    total: studentNames.length,
  });

  for (const name of studentNames) {
    progressBar.tick();
    const scoreDetail = await getStudentScore(name, data.score);
    if (scoreDetail) {
      results.push({ name, scoreDetail });
      console.log(
        `\r ${progressBar.curr}号 ${name} - ${scoreDetail.length}科目成绩获取成功`
      );
    } else {
      results.push({ name, scoreDetail: [{ subject: "错误", score: "错误" }] });
      console.log(`\r ${progressBar.curr}号 ${name} - 获取成绩失败`);
    }
  }

  const subjects = [
    ...new Set(
      results.flatMap((result) =>
        result.scoreDetail.map((detail) => detail.subject)
      )
    ),
  ];

  return {
    type: "score",
    data: results,
    columns: ["姓名", ...subjects],
    fileName: `${data.title}_${classMap[data.cls]}_${data.creator_wx_name}_${
      results.length
    }人`,
    formatRow: (result) => {
      const row = { 姓名: result.name };
      result.scoreDetail.forEach((detail) => {
        row[detail.subject] = detail.score;
      });
      return row;
    },
  };
}

// 处理学生信息数据
async function processStudentInfoData(data, classMap) {
  if (!data.attach || !data.attach.headers || !data.attach.detail) {
    console.log("数据格式不正确，缺少必要的信息");
    return null;
  }

  // 从attach对象中获取表头信息
  const headers = ["姓名", ...data.attach.headers];

  // 处理每个学生的数据
  const studentData = data.attach.detail.map((student) => {
    const row = {
      姓名: student.name,
    };

    // 将infos数组的数据按顺序填入对应的列
    student.infos.forEach((info, index) => {
      row[data.attach.headers[index]] = info.latest || "";
    });

    return row;
  });

  return {
    type: "studentInfo",
    data: studentData,
    columns: headers,
    fileName: `${data.title}_${classMap[data.cls]}_${data.creator_wx_name}_${
      studentData.length
    }人`,
    formatRow: (row) => row,
  };
}

async function processClassMemberData(data, classMap, currentCls) {
  // 提取所有成员信息
  const members = data.data.members;

  // 定义表头
  const headers = ["姓名", "电话", "微信昵称", "微信头像", "身份"];

  // 处理每个成员的数据
  const memberData = [];

  // 首先处理老师信息
  const teachers = members.filter((member) => member.teach_role !== -1);
  const students = members.filter((member) => member.teach_role === -1);

  // 处理老师数据
  teachers.forEach((teacher) => {
    // 添加老师本人信息
    const teacherRow = {
      姓名: teacher.name || "",
      电话: teacher.phone || "",
      微信昵称: teacher.wx_name || "",
      微信头像: teacher.wx_avatar || "",
      身份: teacher.teach_role_str ? `${teacher.teach_role_str}老师` : "老师",
    };
    memberData.push(teacherRow);

    // 处理老师的家庭成员信息
    teacher.family.forEach((familyMember) => {
      const familyRow = {
        姓名: "",
        电话: familyMember.phone || "",
        微信昵称: familyMember.wx_name || "",
        微信头像: familyMember.wx_avatar || "",
        身份: `${teacherRow.姓名}的家长`,
      };
      memberData.push(familyRow);
    });
  });

  // 处理学生数据
  students.forEach((student) => {
    // 添加学生本人信息
    const studentRow = {
      姓名: student.name || "",
      电话: student.phone || "",
      微信昵称: student.wx_name || "",
      微信头像: student.wx_avatar || "",
      身份: "学生",
    };
    memberData.push(studentRow);

    // 处理学生的家庭成员信息
    student.family.forEach((familyMember) => {
      const familyRow = {
        姓名: "",
        电话: familyMember.phone || "",
        微信昵称: familyMember.wx_name || "",
        微信头像: familyMember.wx_avatar || "",
        身份: `${studentRow.姓名}的家长`,
      };
      memberData.push(familyRow);
    });
  });

  return {
    type: "classMember",
    data: memberData,
    columns: headers,
    fileName: `班级成员信息_${classMap[currentCls]}_${members.length}人`,
    formatRow: (row) => row,
  };
}

async function getClassMembers(cid) {
  const response = await axios.post(
    "https://b.welife001.com/applet/getMembersByCid",
    {
      cid,
      updateclass: 1,
      all_status: true,
    },
    {
      headers: { ...getHeaders(), authorization: jwttoken },
    }
  );
  return response.data;
}

// 生成Excel文件
async function generateExcel(processedData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("数据");

  // 设置列
  worksheet.columns = processedData.columns.map((header) => ({
    header,
    key: header,
    width: 20,
  }));

  // 添加数据行
  if (processedData.type === "score") {
    processedData.data.forEach((result) => {
      worksheet.addRow(processedData.formatRow(result));
    });
  } else if (processedData.type === "studentInfo") {
    // 添加说明行
    worksheet.addRow(
      processedData.columns.reduce((obj, header) => {
        obj[header] = header === "姓名" ? "说明" : "";
        return obj;
      }, {})
    );
    worksheet.addRow(
      processedData.columns.reduce((obj, header) => {
        obj[header] =
          header === "身份证件号"
            ? "请大家核对学籍信息是否有误 ① 名字是否有误  ②性别是否有误  ③ 身份证号码是否有误，如有误请及时与班主任联系，谢谢！"
            : "";
        return obj;
      }, {})
    );

    // 添加空行
    worksheet.addRow({});

    // 添加学生数据
    processedData.data.forEach((row) => {
      worksheet.addRow(row);
    });
  } else if (processedData.type === "classMember") {
    // 添加说明行
    worksheet.addRow(
      processedData.columns.reduce((obj, header) => {
        obj[header] = header === "姓名" ? "说明" : "";
        return obj;
      }, {})
    );
    worksheet.addRow(
      processedData.columns.reduce((obj, header) => {
        obj[header] =
          header === "身份证件号"
            ? "请大家核对学籍信息是否有误 ① 名字是否有误  ②性别是否有误  ③ 身份证号码是否有误，如有误请及时与班主任联系，谢谢！"
            : "";
        return obj;
      }, {})
    );

    // 添加空行
    worksheet.addRow({});

    // 添加成员数据
    processedData.data.forEach((row) => {
      worksheet.addRow(row);
    });
  }

  const now = Date.now();
  const fileNameWithTime = `${processedData.fileName}_${now}.xlsx`;
  const outputPath = resolve(process.cwd(), fileNameWithTime);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n\n数据处理完毕，已保存到${outputPath}`);
}

async function getClassByMemberId(memberIds) {
  const response = await axios.post(
    "https://b.welife001.com/applet/getClassByMemberId",
    {
      member_ids: memberIds,
    },
    {
      headers: { ...getHeaders(), authorization: jwttoken },
    }
  );
  return response.data.data;
}

async function getClassById(cid) {
  const response = await axios.post(
    "https://b.welife001.com/applet/getClassById",
    {
      cid,
    },
    {
      headers: { ...getHeaders(), authorization: jwttoken },
    }
  );
  return response.data.data.class.rosters.map((roster) => roster.name);
}

async function getStudentScore(name, id) {
  try {
    const response = await axios.post(
      "https://b.welife001.com/getStudentScoreById",
      { id, name },
      {
        headers: { ...getHeaders(), imprint },
      }
    );
    return response.data.data.studentScore.score_detail;
  } catch (error) {
    console.error(`Error fetching score for ${name}:`, error);
    return null;
  }
}

async function main() {
  console.log(`
========================================
班级小管家工具

孙悟元 https://wuyuan.dev
项目使用AGPL-3.0-only协议开源，
开源地址：https://github.com/Sunwuyuan/XGJPplus
Copyright (C) 2025-${new Date().getFullYear()} SunWuyuan <https://github.com/Sunwuyuan>.

========================================

    `);
  /*

项目使用AGPL-3.0-only协议开源，因此，
如需署名请添加新行，请勿删除或修改上述内容。
请勿删除或修改这里的注释。

*/

  // Fetch version info before anything else
  await fetchVersionInfo();
  // Initialize request config
  initRequestConfig();
  // Update headers with fetched version info
  // The headers are now generated dynamically in getHeaders

  // Load cache and check if we have a valid token
  const cache = loadCache();
  if (cache && isTokenValid(cache)) {
    console.log("从缓存中获取到可用令牌");
    jwttoken = cache.jwttoken;
    imprint = cache.imprint;

    try {
      // Test if the cached token is still valid
      await getUserChildInfo();
      console.log("缓存中的令牌可用（如需退出请删除cache.json）");
    } catch (error) {
      console.log("缓存中的令牌已失效，重新登录...");
      jwttoken = "";
      imprint = "";
    }
  }

  if (!jwttoken) {
    await login();
  }

  const childList = await getUserChildInfo();
  const members = childList.map((child) => child.member_id);
  const parentInfo = await getParentInfo(members);
  const classInfo = await getClassByMemberId(members);

  const classMap = classInfo.reduce((map, cls) => {
    map[cls._id] = cls.class_name;
    return map;
  }, {});

  console.log("请选择要处理的数据：");
  console.log("0. 处理所有班级成员信息");
  parentInfo.forEach((info, index) => {
    const className = classMap[info.cls] || "未知班级";
    const typeDesc =
      info.type === 4
        ? "成绩单"
        : info.type === 15
        ? "学生信息"
        : `类型${info.type} 暂不支持`;
    console.log(
      `${index + 1}. ${info.title} (${className}) - ${
        info.creator_wx_name
      } [${typeDesc}]`
    );
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const selectedIndex = await new Promise((resolve) => {
    rl.question("请输入选择的编号：", (answer) => {
      rl.close();
      resolve(parseInt(answer));
    });
  });

  if (selectedIndex === 0) {
    // 处理所有班级信息
    console.log("开始处理所有班级信息...");
    for (const [cls, className] of Object.entries(classMap)) {
      console.log(`正在处理班级: ${className}`);
      const membersData = await getClassMembers(cls);
      const processedData = await processClassMemberData(
        membersData,
        classMap,
        cls
      );
      if (processedData) {
        await generateExcel(processedData);
      }
    }
    console.log("所有班级处理完成！");
  } else {
    const selectedInfo = parentInfo[selectedIndex - 1];
    imprint = selectedInfo.creator_wx_openid;
    const processedData = await processDataByType(selectedInfo, classMap);
    if (processedData) {
      await generateExcel(processedData);
    }
  }
}

main();
