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

let imprint = process.env.IMPRINT || "";
let jwttoken = process.env.JWTTOKEN || "";

const headers = {
  accept: "*/*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  "app-info": "1/3.0.8/734",
  "cache-control": "no-cache",
  "content-type": "application/json; charset=utf-8",
  "sec-ch-ua":
    '"Not A(Brand";v="8", "Chromium";v="132", "Microsoft Edge";v="132"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "cross-site",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0",
  referer: "https://service.banjixiaoguanjia.com/",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

async function getQrCode() {
  const response = await axios.post(
    "https://a.welife001.com/app/auth/getQrCodeImg",
    {
      channel: "app_web",
      platform: "app",
      app_info: { app_vcode: "734", app_vname: "3.0.8" },
      device_info: { network_type: "WiFi" },
    },
    { headers }
  );
  return response.data;
}

async function checkLoginStatus(random) {
  const response = await axios.post(
    "https://a.welife001.com/app/auth/checkLoginStatusWithToken",
    {
      random,
      channel: "app_web",
      platform: "app",
      app_info: { app_vcode: "734", app_vname: "3.0.8" },
      device_info: { network_type: "WiFi" },
    },
    { headers }
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
    "https://service.banjixiaoguanjia.com/app/getUserChildInfoApp",
    {},
    {
      headers: { ...headers, authorization: jwttoken },
    }
  );
  return response.data.data.childList;
}

async function getParentInfo(members) {
  const response = await axios.get(
    `https://a.welife001.com/info/getParent?members=${members.join(
      "%3A"
    )}&type=-1&date=-1&page=0&size=20&isRecent=false`,
    {
      headers: { ...headers, authorization: jwttoken },
    }
  );
  return response.data.data.filter((item) => item.type === 4);
}

async function getClassByMemberId(memberIds) {
  const response = await axios.post(
    "https://a.welife001.com/applet/getClassByMemberId",
    {
      member_ids: memberIds,
    },
    {
      headers: { ...headers, authorization: jwttoken },
    }
  );
  return response.data.data;
}

async function getClassById(cid) {
  const response = await axios.post(
    "https://a.welife001.com/applet/getClassById",
    {
      cid,
    },
    {
      headers: { ...headers, authorization: jwttoken },
    }
  );
  return response.data.data.class.rosters.map((roster) => roster.name);
}

async function getStudentScore(name, id) {
  try {
    const response = await axios.post(
      "https://a.welife001.com/getStudentScoreById",
      { id, name },
      {
        headers: { ...headers, imprint },
      }
    );
    return response.data.data.studentScore.score_detail;
  } catch (error) {
    console.error(`Error fetching score for ${name}:`, error);
    return null;
  }
}

async function main() {
  if (!imprint) {
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

  console.log("请选择一个成绩单：");
  parentInfo.forEach((info, index) => {
    const className = classMap[info.cls] || "未知班级";
    console.log(
      `${index + 1}. ${info.title} (${className}) - ${info.creator_wx_name}`
    );
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const selectedIndex = await new Promise((resolve) => {
    rl.question("请输入选择的编号：", (answer) => {
      rl.close();
      resolve(parseInt(answer) - 1);
    });
  });

  const selectedInfo = parentInfo[selectedIndex];
  imprint = selectedInfo.creator_wx_openid;
  const scoreId = selectedInfo.score;
  const studentNames = await getClassById(selectedInfo.cls);

  const results = [];
  const progressBar = new ProgressBar("[:bar] :percent", {
    complete: "=",
    incomplete: " ",
    width: 20,
    total: studentNames.length,
  });

  for (const name of studentNames) {
    progressBar.tick();
    const scoreDetail = await getStudentScore(name, scoreId);
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

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('成绩单');

  worksheet.columns = [
    { header: '姓名', key: 'name', width: 20 },
    ...subjects.map(subject => ({ header: subject, key: subject, width: 15 }))
  ];

  results.forEach(result => {
    const row = { name: result.name };
    result.scoreDetail.forEach(detail => {
      row[detail.subject] = detail.score;
    });
    worksheet.addRow(row);
  });

  const fileName = `${selectedInfo.title}_${classMap[selectedInfo.cls]}_${
    selectedInfo.creator_wx_name
  }_${studentNames.length}人.xlsx`;
  const now = Date.now();
  const fileNameWithTime = `${selectedInfo.title}_${
    classMap[selectedInfo.cls]
  }_${selectedInfo.creator_wx_name}_${studentNames.length}人_${now}.xlsx`;

  const outputPath = resolve(process.cwd(), fileNameWithTime);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n\n所有成绩获取完毕，已保存到${outputPath}`);
}

main();
