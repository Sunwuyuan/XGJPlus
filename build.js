import { exec } from 'child_process';
import { readFile, writeFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 使用ncc打包index.js
exec('ncc build index.js -o dist', (err, stdout, stderr) => {
    if (err) {
        console.error(`构建失败: ${stderr}`);
        return;
    }
    console.log(`构建成功: ${stdout}`);

    // 读取打包后的文件
    const filePath = join(__dirname, 'dist', 'index.js');
    readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`读取文件失败: ${err}`);
            return;
        }

        // 替换所有的\033为\x1b
        const result = data.replace(/\\033/g, '\\x1b');

        // 写回文件
        writeFile(filePath, result, 'utf8', (err) => {
            if (err) {
                console.error(`写入文件失败: ${err}`);
                return;
            }
            console.log('替换完成');
        });
    });
});
