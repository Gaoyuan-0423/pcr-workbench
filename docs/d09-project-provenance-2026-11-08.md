# D09 follow-up: saved-project interpretation provenance

This narrow follow-up is based on PR #12 commit `7eba925fc9404f5c440ea9da6597a58e13ac5ef5`.

## Corrected behavior

Opening a saved project from **My projects** now restores its saved `guessBasis`, or clears the basis when a legacy project has none. Previously, this path restored the measurements and configuration but retained the preceding project's inference basis. The current report caption and AI request could therefore name the wrong source basis.

The basis sent in the AI request is now part of the interpretation card's identity. Changing only that basis invalidates a completed or pending interpretation even when the numerical inputs, settings and quality report are identical. Existing remount/abort behavior remains in place; no automatic model request is introduced.

Two browser regressions use synthetic saved projects with identical measurements and different bases. They check that a completed interpretation is cleared, the next request contains the opened project's basis, and a delayed response from the previous project cannot replace the current answer or clear its busy state. The delayed-response mock deliberately ignores abort. These tests make no external model calls.

## Checks in this environment

| Check | Result |
| --- | --- |
| `npm test` | 24 files, 207 tests passed |
| `npm run build` | Passed; existing bundle-size and mixed-import warnings remain |
| `npm run lint` | Exit 0; 23 existing warnings |
| `git diff --check` | Passed |
| The two new Playwright tests | Could not execute: no installed Chromium; the browser download returned an invalid ZIP. Browser startup failed before either test body ran. CI execution remains required. |

The original defect was reproduced before editing by executing the existing project-open callback with distinct saved/current bases. No claim is made that the new browser tests have passed locally. This follow-up does not change numerical analysis, inference variables or amplification-efficiency handling. D09 remains partial: complete interpretation-source archiving and real external-model validation are outside this change.

## 中文说明

本次仅修复“我的课题”打开路径遗漏恢复推断依据，以及相同数值、不同推断依据时旧解读未失效的问题。已通过现有 207 个单元测试、构建和 lint；新增两条浏览器回归因本地缺少浏览器且下载失败，尚待 CI 执行。未改动统计或效率校正，也不宣称 D09 全部完成。
