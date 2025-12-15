#!/usr/bin/env node

/**
 * 数据清理脚本
 * Data Cleanup Script
 *
 * 清理过期的日志、缓存和临时文件
 * Cleans up expired logs, cache, and temporary files
 */

// 导入环境变量 / Import environment variables
import 'dotenv/config';

// 导入文件系统模块 / Import file system module
import fs from 'fs';
import path from 'path';

// 导入命令行参数解析 / Import command line argument parser
import { program } from 'commander';

// ============================================
// 命令行参数配置 / Command Line Argument Configuration
// ============================================

program
  .name('cleanup')
  .description('清理过期文件 / Cleanup expired files')
  .version('1.0.0')
  .option('-d, --days <days>', '保留天数 / Days to keep', '7')
  .option('--logs', '清理日志 / Clean logs', false)
  .option('--cache', '清理缓存 / Clean cache', false)
  .option('--temp', '清理临时文件 / Clean temp files', false)
  .option('--all', '清理所有 / Clean all', false)
  .option('--dry-run', '仅显示不删除 / Show only, do not delete', false)
  .parse();

// 获取命令行参数 / Get command line arguments
const options = program.opts();

/**
 * 获取目录中的所有文件
 * Get all files in directory
 * @param {string} dir - 目录路径 / Directory path
 * @returns {string[]} 文件路径列表 / File path list
 */
function getFiles(dir) {
  const files = [];

  // 检查目录是否存在 / Check if directory exists
  if (!fs.existsSync(dir)) {
    return files;
  }

  // 读取目录内容 / Read directory contents
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 递归获取子目录文件 / Recursively get subdirectory files
      files.push(...getFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 检查文件是否过期
 * Check if file is expired
 * @param {string} filePath - 文件路径 / File path
 * @param {number} days - 保留天数 / Days to keep
 * @returns {boolean} 是否过期 / Is expired
 */
function isExpired(filePath, days) {
  try {
    // 获取文件状态 / Get file stats
    const stats = fs.statSync(filePath);

    // 计算过期时间 / Calculate expiry time
    const expiryTime = Date.now() - days * 24 * 60 * 60 * 1000;

    // 检查修改时间 / Check modification time
    return stats.mtime.getTime() < expiryTime;
  } catch {
    return false;
  }
}

/**
 * 格式化文件大小
 * Format file size
 * @param {number} bytes - 字节数 / Bytes
 * @returns {string} 格式化后的大小 / Formatted size
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 清理目录
 * Clean directory
 * @param {string} dir - 目录路径 / Directory path
 * @param {string} name - 目录名称 / Directory name
 * @param {number} days - 保留天数 / Days to keep
 * @param {boolean} dryRun - 是否仅显示 / Dry run
 * @returns {Object} 清理结果 / Cleanup result
 */
function cleanDirectory(dir, name, days, dryRun) {
  console.log(`\n→ 清理${name} / Cleaning ${name}...`);
  console.log(`  目录 / Directory: ${dir}`);
  console.log(`  保留天数 / Keep days: ${days}`);

  // 获取所有文件 / Get all files
  const files = getFiles(dir);

  // 统计 / Statistics
  let deletedCount = 0;
  let deletedSize = 0;
  let keptCount = 0;
  let keptSize = 0;

  // 检查每个文件 / Check each file
  for (const file of files) {
    const stats = fs.statSync(file);

    if (isExpired(file, days)) {
      // 过期文件 / Expired file
      deletedCount++;
      deletedSize += stats.size;

      if (dryRun) {
        console.log(`  [将删除 / Will delete] ${file}`);
      } else {
        // 删除文件 / Delete file
        fs.unlinkSync(file);
        console.log(`  [已删除 / Deleted] ${file}`);
      }
    } else {
      // 保留文件 / Keep file
      keptCount++;
      keptSize += stats.size;
    }
  }

  // 清理空目录 / Clean empty directories
  if (!dryRun) {
    cleanEmptyDirs(dir);
  }

  // 返回结果 / Return result
  return {
    name,
    dir,
    deletedCount,
    deletedSize,
    keptCount,
    keptSize,
  };
}

/**
 * 清理空目录
 * Clean empty directories
 * @param {string} dir - 目录路径 / Directory path
 */
function cleanEmptyDirs(dir) {
  // 检查目录是否存在 / Check if directory exists
  if (!fs.existsSync(dir)) {
    return;
  }

  // 读取目录内容 / Read directory contents
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  // 递归清理子目录 / Recursively clean subdirectories
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name);
      cleanEmptyDirs(subDir);

      // 如果子目录为空，删除它 / If subdirectory is empty, delete it
      const subEntries = fs.readdirSync(subDir);
      if (subEntries.length === 0) {
        fs.rmdirSync(subDir);
        console.log(`  [删除空目录 / Deleted empty dir] ${subDir}`);
      }
    }
  }
}

/**
 * 运行清理
 * Run cleanup
 */
function runCleanup() {
  console.log('================================================');
  console.log('         数据清理工具 / Data Cleanup Tool');
  console.log('================================================');

  // 解析参数 / Parse arguments
  const days = parseInt(options.days, 10);
  const dryRun = options.dryRun;
  const cleanAll = options.all;
  const cleanLogs = options.logs || cleanAll;
  const cleanCache = options.cache || cleanAll;
  const cleanTemp = options.temp || cleanAll;

  // 如果没有指定任何清理选项 / If no cleanup option specified
  if (!cleanLogs && !cleanCache && !cleanTemp) {
    console.log('\n请指定要清理的内容，使用 --help 查看帮助');
    console.log('Please specify what to clean, use --help for help\n');
    return;
  }

  // 显示模式 / Display mode
  if (dryRun) {
    console.log('\n[模拟模式 / DRY RUN MODE - 不会实际删除文件 / No files will be deleted]');
  }

  // 收集结果 / Collect results
  const results = [];

  // 清理日志 / Clean logs
  if (cleanLogs) {
    results.push(cleanDirectory('logs', '日志 / Logs', days, dryRun));
  }

  // 清理缓存 / Clean cache
  if (cleanCache) {
    results.push(cleanDirectory('data/cache', '缓存 / Cache', days, dryRun));
  }

  // 清理临时文件 / Clean temp files
  if (cleanTemp) {
    results.push(cleanDirectory('data/temp', '临时文件 / Temp', days, dryRun));
  }

  // 显示汇总 / Display summary
  console.log('\n================================================');
  console.log('              清理汇总 / Cleanup Summary');
  console.log('================================================\n');

  let totalDeleted = 0;
  let totalDeletedSize = 0;
  let totalKept = 0;
  let totalKeptSize = 0;

  for (const result of results) {
    console.log(`${result.name}:`);
    console.log(`  删除 / Deleted: ${result.deletedCount} 个文件, ${formatSize(result.deletedSize)}`);
    console.log(`  保留 / Kept: ${result.keptCount} 个文件, ${formatSize(result.keptSize)}`);
    console.log('');

    totalDeleted += result.deletedCount;
    totalDeletedSize += result.deletedSize;
    totalKept += result.keptCount;
    totalKeptSize += result.keptSize;
  }

  console.log('总计 / Total:');
  console.log(`  删除 / Deleted: ${totalDeleted} 个文件, ${formatSize(totalDeletedSize)}`);
  console.log(`  保留 / Kept: ${totalKept} 个文件, ${formatSize(totalKeptSize)}`);
  console.log(`  释放空间 / Space freed: ${formatSize(totalDeletedSize)}`);
  console.log('');

  if (dryRun) {
    console.log('[提示 / Note] 这是模拟运行，移除 --dry-run 参数以实际执行删除');
    console.log('[提示 / Note] This was a dry run, remove --dry-run to actually delete\n');
  }

  console.log('✓ 清理完成 / Cleanup complete!\n');
}

// 运行清理 / Run cleanup
runCleanup();
