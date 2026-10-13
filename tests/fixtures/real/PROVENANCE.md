# 真实仪器导出文件来源

本目录下的文件为**真实仪器软件导出的公开数据**，仅用作解析管线的回归测试（`src/core/real-files.test.ts`）。

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `2019-04-25_124559-GAPDH.csv` | [neuroeddu/Auto-qPCR](https://github.com/neuroeddu/Auto-qPCR) `Example_Data/Absolute/` | Thermo QuantStudio 96 孔导出，带约 25 行元数据头（MIT 许可） |
| `2019-04-26_161050-GRIA1.csv` | 同上 | Thermo QuantStudio 96 孔导出（MIT 许可） |
| `RELATIVE_example.csv` | 同上 `Example_Data/RELATIVE_example.csv` | Thermo QuantStudio **384 孔**导出（MIT 许可） |

这些文件中的实验数据本身是公开数据集的一部分，按上游仓库的 MIT 许可随本仓库分发。若要补充其他仪器（CFX / LightCycler / Rotor-Gene）的真实导出样本，请确认许可后放入本目录并在此登记。
