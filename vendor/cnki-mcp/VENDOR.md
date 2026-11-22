# cnki-mcp 来源备注

| 字段 | 值 |
|---|---|
| 上游仓库 | `https://github.com/SepineTam/cnki-mcp.git` |
| 上游提交 | `dcd79311cf6d3207d8bbf42e3ff0aaca9447c767` |
| 上游版本 | `0.2.0` |
| 获取日期 | `2026-10-22` |
| 许可证 | GPL-3.0 |

本目录保留上游 Python 源码、`pyproject.toml`、README 和许可证，作为独立进程由 `dsh-scholar-search` 调用。同步上游版本时应更新本文件中的提交和版本，并重新执行 Python 语法检查、插件测试与 npm 打包清单检查。

## 0.1.1 → 0.2.0 的差异

上游 6 个提交里只有 3 个代码/依赖文件变化：

- `src/cnki_mcp/core/parsers/detail_parser.py`：作者区的 `/organ/detail` 链接改归 `institution`，不再混进 `authors`。插件侧因此能拿到干净的作者列表，机构落在 `organizations`。
- `pyproject.toml`：版本号、docs 可选依赖、项目链接；运行时依赖未变。
- `tests/core/parsers/test_detail_parser.py`：对应回归，本目录不随包分发测试。

其余是文档：README 免责声明、`plugins/agents/cnki-in-chrome-use.md`、`plugins/agents/cnki-searcher.md`、`plugins/skills/cnki-search/`、`plugins/skills/explore-cnki-view/`。

上游**没有**恢复全文下载：`src/cnki_mcp/core/tools/no-download-now.py` 仍在，`cnki-in-chrome-use` agent 明确写“不向 cnki-mcp 添加全文下载能力”。插件的中文下载入口走 dsh-browser 读取页面入口，与此保持一致。
