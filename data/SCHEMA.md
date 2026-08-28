# 数据结构说明（v1.2，公开通用路线配置）

本目录采用“数据集对象 + 记录数组”结构，而不是把记录直接写进 HTML。每个数据集都有 `schema_version` 与 `dataset_status`；涉及数值的数据集另有单位说明，便于后续迁移与检查。

## 关系

- `trip-config.json` 保存公开版路线起点、时长、体力、用餐缓冲和可选离境日规则；不保存用户住宿状态、航班或固定个人旅行日期。
- `areas.json` 的 `areas[]` 是已配置的区域字典。景点和餐厅通过 `area_id` 引用区域；保留 `area` 供当前父母版页面直接展示。
- `places.json` 的 `places[]` 保存景点。路线、选择状态只保存景点 `id`。
- `restaurants.json` 的 `restaurants[]` 保存餐厅。同一餐厅通过 `meal_types[]` 同时属于早餐、午餐或晚餐，不复制记录。
- `transport.json` 的 `transport_options[]` 保存交通运营方式和官方入口。未来路线段通过交通 `id` 引用它。
- `sources.json` 的 `sources[]` 是统一来源表。景点、餐厅、交通中的 `source_ids` 或 `*_source_id` 指向来源 `id`。

## 统一约定

- 所有 ID 使用稳定、唯一、可读的 kebab-case 字符串。
- 日期使用 `YYYY-MM-DD`；带时间戳的验证时间使用 ISO 8601。
- 营业时间按 `Asia/Tokyo` 时区处理，时刻使用 24 小时制 `HH:mm`。
- 时长统一为分钟，距离统一为米，金额与币种分开保存。
- 未核实数据使用 `null`，不能用 `0` 代替“不知道”。
- `display_text` 只负责父母页面上的易读展示；算法读取结构化字段。
- 正式候选版不得保留 `demo_placeholder`、`template_placeholder` 或 `configuration_placeholder`；区域使用 `record_status: "configured_area"`。
- 关键字段块必须各自保存 `source_ids[]` 与 `verified_at`，不能只依赖整条记录的统一验证日期。

## 公开路线配置 trip-config

- `route_origins` 保存可选地理起点；默认是名古屋站。名古屋万豪附近只是一项地理快捷选项，不表示用户实际入住。
- `default_route.destination_policy: return_to_origin` 表示路线默认回到用户所选起点。
- 路线日期由前台普通日期选择器提供，`route_options.date_input.allow_any_valid_date` 必须为 `true`。
- `departure_day_option` 只定义可选离境日行为。离境日由每次路线请求显式勾选，`route_end_deadline` 也属于当次请求；没有填写时只给保守提醒。
- 配置中不得保存航空公司、航班号、机场、航站楼、抵离时间或固定离境日期。
- `route_options` 保存三档时长、三档体力及路线必须检查的营业规则。
- `route_options.start_time_options` 保存简单的上午/下午开始选项；`default_start_time` 是4A估算默认值，不是永久固定出发时间。
- `route_options.pace_profiles` 同时保存停留时间规则与缓冲：少走路使用建议停留时间，每个景点20分钟缓冲并加25分钟基础缓冲；普通为15＋20分钟；多逛几个可用快速/较短建议停留，每景点10分钟并加15分钟基础缓冲。
- `route_options.meal_break_minutes` 为大半天和全天预留45/60分钟用餐时间；餐厅仅作为区域候选，不在4A自动插入具体时间。
- 景点和餐厅若没有所选日期的明确临时状态或日期例外，仍按固定星期与常规营业时段计算，同时提示“该日期临时营业信息待确认”。

## 区域 areas

- 区域只表示地理聚类，不代表路线。
- `id` 是景点和餐厅引用的稳定键；区域改名不应改变 `id`。
- `sort_order` 控制前台顺序；`center` 预留给地图聚焦和未来聚类检查。
- 当前包含名古屋站、名古屋城 / 德川、东山 / 栄、热田、伏见 / 大须、名古屋港、金城ふ头和犬山。

## 字段级来源与验证

以下关键块必须独立带有 `source_ids` 和 `verified_at`：

- 景点：`location`、`ratings.*`、`admission`、`opening_hours`、`visit_duration_minutes`、`transport_from_hotel`；
- 餐厅：`location`、`ratings.*`、`price_per_person`、`business_hours`、`reservation`、`queue`；
- 交通：`reference_fare`、`ic_card`、`purchase`、`boarding`；
- 代表菜：每道菜已有 `source_id` / `source_url` 与 `verified_at`。

`verified_at` 使用 ISO 8601；占位或未复核内容必须为 `null`。`source_ids` 指向 `sources.json`，来源本身的链接状态仍由 `sources[].verification` 管理。

## 评分 ratings

- `recommendation.stars` 是本项目的“推荐 ★★★★★”，不是外部平台原始分数。
- 国内、日本本地、海外分组均使用 `entries[]` 保存每个平台的原始记录。
- 每条平台记录必须保存 `platform`、`score`、`scale`、`review_count`、`source_ids`、`verified_at`。
- 没有数字评分的平台可令 `score`、`scale` 为 `null`，但不能伪造星级。
- `aggregation_method` 当前固定为 `none`；不把食べログ、Google、Tripadvisor 等不同量尺直接平均。

## 景点 places

关键分组：

- `names`：中、日、英文名。
- `location`：地址、经纬度、最近车站数组。
- `place_types`、`tags`、`environment`：分类与筛选。
- `ratings`：推荐、国内、日本本地、海外四组，彼此独立，不做跨平台简单平均。
- `admission`：票价金额、展示文字、来源。
- `opening_hours`：每周时段、最晚入场、固定休馆、节假日顺延、不定休和临时休馆。
- `visit_duration_minutes`：快速、推荐、慢速三档。
- `transport_from_hotel`：酒店出发时间、方式、费用、换乘和步行。
- `parent_access`：步行强度、父母友好、座椅和无障碍备注。
- `links`：官网、营业时间、票价与地图来源 ID。
- `images`：图片 URL、来源、授权、作者、使用备注。

正式营业时间记录示例：

```json
{
  "timezone": "Asia/Tokyo",
  "weekly": [
    {
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "periods": [{ "open": "09:00", "close": "17:00" }]
    }
  ],
  "last_admission": "16:30",
  "closure_rules": {
    "fixed_weekdays": ["mon"],
    "holiday_shift_rule": "next_weekday",
    "irregular_closures": false,
    "temporary_closures": [
      { "start_date": "2026-09-02", "end_date": "2026-09-02", "reason": "", "source_ids": [] }
    ]
  }
}
```

## 餐厅 restaurants

关键分组：

- `names.branch_zh` / `names.branch_ja` 明确分店，避免链接指错门店。
- `meal_types` 是数组，允许一条记录同时出现在午餐和晚餐。
- `cuisine_types` 保存稳定的菜系代码；`dish_tags` 保存代表性菜品与偏好筛选标签；中文显示可继续使用 `restaurant_types` / `cuisine_tags`。
- `business_hours.service_periods` 分开保存早餐、午餐、晚餐时间段。
- `business_hours.last_orders` 分餐别保存 Last Order；`date_exceptions[]` 支持指定日期休业或覆盖当天时段。
- `business_hours.display_text_by_meal` 为各餐别保存独立的父母页营业时间文案，避免午餐卡误显示晚餐时间。
- `reservation` 保存是否建议/必须预约、预约方式、开放窗口和是否接受现场客。
- `queue` 保存 `level`（`low | medium | high | very_high`）、可得时的典型等待分钟、高峰/非高峰范围、排队系统、号码票与最后取号时间；单条游客等待经历不能直接写成平均等待。
- 午晚餐共用记录在 `price_per_person.by_meal`、`reservation.by_meal`、`queue.by_meal` 中分别保存午餐和晚餐值；顶层字段继续保留，供旧页面与数据迁移兼容。
- `dining_environment` 保存座席种类、座位数、包间、禁烟、噪音、居酒屋倾向、是否要求点酒、空调、家庭适配、席料/お通し与服务费。无法从公开资料确认时必须使用 `null` 或 `unknown`。
- `access_from_hotel` 保存从名古屋万豪酒店出发的参考分钟数、方式、步行距离/说明及独立来源；早餐直接展示该字段，午餐保留它作为区域间参考，不替代后续动态路线算法。
- `nearby_place_ids[]` 让午餐直接引用附近的正式景点 ID；`access_from_nearby_places[]` 分别保存景点到餐厅的参考步行分钟、易读说明、来源与核实日期。该关联只为后续路线推荐准备数据，本阶段不计算景点 A 到景点 B 的路线。
- `domestic_research_status` / `ratings.domestic.research_status` 可标记 `pending_manual_xiaohongshu`。此状态表示一次正常浏览器尝试不稳定后转人工补充，不允许据此伪造国内评分。
- `signature_dishes` 每个餐别在页面上保存/展示 3～5 道菜；同一记录合并午晚餐后总数可到10道。每道菜可用 `meal_types[]` 标明适用餐别，价格类型限定为 `official`、`recent_reference`、`unknown`。
- `parent_display` 是与研究原始字段分离的父母版展示层，不覆盖评分、营业时间、价格或评价来源。字段如下：
  - `summary`：约15～35个中文字的选择摘要；`food_focus`：一句话说明主要吃什么。
  - `featured_meals[]`：该店在哪些餐别进入“优先推荐”；不是五星筛选，也不改变 `ratings.recommendation`。
  - `featured_reason`：进入优先推荐的旅行用途；非优先店使用 `null`。
  - `badges[]`：父母卡最多显示4个地理、料理或实用标签。
  - `cautions[]`：默认卡必须直显的旅行决策提醒。每项保存 `tone`（`warning | closed`）、`text` 和适用 `meal_types[]`。
  - `scene_hint`：可选的“特别适合这种时候”提示；无明确用途时为 `null`。
  - `default_dish_names_by_meal`：每餐别默认显示2～3道代表菜，名称必须匹配 `signature_dishes[].name_zh`；后台代表菜仍完整保留。
  - `display_order_by_meal`：各餐别内的稳定展示顺序。优先推荐和更多选择分别按此值排序。
- 父母版国内平台文案由 `ratings.domestic` 的结构化摘要生成：分店样本为0但存在品牌样本时必须标注“品牌口味参考”；没有样本时显示“暂无足够分店评价”。
- `internal_research.service_risk` 保存隐藏的服务风险状态、信号、候选决策和复核来源；前台渲染器不得读取或显示该字段。
- `links` 通过来源 ID 指向官网、菜单、预约与地图链接。

正式餐厅使用 `record_status: "verified_candidate"`。第三阶段C完成后不保留餐厅 Demo；同一家店通过 `meal_types[]` 同时进入午餐和晚餐筛选，仅保存一条记录、共用一个“想吃”选择状态。当前正餐库18条：仅午餐5条、午晚餐7条、仅晚餐6条。

父母页面按餐别先显示少量“优先推荐”，其余折叠在“更多选择”。当前约束为早餐3～4家、午餐5～6家、晚餐5～6家。展开详情才显示平台口碑、完整分餐别营业信息、全部代表菜和外部链接；后台风险、来源ID与研究技术信息永不渲染。

午餐景点关联示例：

```json
{
  "nearby_place_ids": ["atsuta-jingu", "shirotori-garden"],
  "access_from_nearby_places": [
    {
      "place_id": "atsuta-jingu",
      "walking_minutes": 5,
      "display_text": "距热田神宫南门步行约5分钟",
      "source_ids": ["src-restaurant-official", "src-restaurant-map"],
      "verified_at": "2026-08-27"
    }
  ]
}
```

酒店出发信息示例：

```json
{
  "access_from_hotel": {
    "duration_minutes": 8,
    "modes": ["walk"],
    "distance_meters": 550,
    "display_text": "从酒店步行约8分钟",
    "source_ids": ["src-restaurant-official", "src-restaurant-map"],
    "verified_at": "2026-08-27"
  }
}
```

餐厅营业时间正式记录示例：

```json
{
  "timezone": "Asia/Tokyo",
  "weekly": [
    {
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "service_periods": [
        { "meal_type": "lunch", "open": "11:00", "close": "14:30", "last_order": "14:00" },
        { "meal_type": "dinner", "open": "17:00", "close": "22:00", "last_order": "21:30" }
      ]
    }
  ],
  "service_periods": {
    "breakfast": [],
    "lunch": [{ "open": "11:00", "close": "14:30" }],
    "dinner": [{ "open": "17:00", "close": "22:00" }]
  },
  "last_orders": {
    "breakfast": null,
    "lunch": "14:00",
    "dinner": "21:30",
    "other": []
  },
  "date_exceptions": [
    {
      "date": "2026-09-02",
      "status": "closed",
      "override_service_periods": null,
      "reason": "",
      "source_ids": [],
      "verified_at": null
    }
  ],
  "source_ids": [],
  "verified_at": null
}
```

## 交通 transport

每项交通保存名称、类型、票价、票种、IC 卡、购买方法、上下车方法，以及官网、时刻表和购票页的来源 ID。路线算法以后只引用交通 ID，不复制运营信息。

## 来源 sources

所有正式外部链接先进入 `sources.json`，验证后才能供前台点击。`verification` 覆盖：

- 原始 URL、HTTP 状态与最终 URL；
- 是否跳转；
- 内容是否符合按钮用途；
- 景点或餐厅分店是否正确；
- 手机端是否检查且可打开；
- 是否需要登录；
- 访问限制和复核备注。

真实来源建议使用的 `source_type`：`official`、`tabelog`、`google`、`tripadvisor`、`xiaohongshu`、`tourism`、`wikimedia`。

## 地图与路线接口

- 实体的地图入口通过来源 ID 或 `js/maps.js` 的 URL 构造器生成。
- 路线请求由 `js/route-planner.js` 统一生成，4A输入为任意有效日期、`duration_mode`、体力、`start_time`、路线起点、可选离境日设置和已选景点ID。
- 4A输出可行性结果：`usable_place_ids`、`unavailable_places`、`clusters`、`recommended_subset`、`remaining_places`、模糊化时长、步行强度、`feasibility`、附近餐厅候选、基础预算接口、警告与仅开发使用的 `debug`。
- `feasibility` 取 `good | moderate | poor | impossible`，父母页面只显示“很合适 / 稍微紧凑 / 比较累 / 不建议这样安排”。它评价的是当前日期、时长、体力与选择组合，不是景点评分。
- 同一区域仍会用经纬度按约4.5公里连通范围拆分微型组合，避免把栄中心与东山远端误当成紧凑步行组。犬山、名古屋港和金城ふ头按远郊区域处理。
- 景点A到B的4A交通时间仅用于可行性估算：同一紧凑区域约10～30分钟，跨区随直线距离提高。不得在父母页面冒充实际地铁或步行时间。
- 营业判断优先使用旅行日期明确状态和日期例外，再检查固定休馆、临时关闭、周营业时段及最晚入场；缺少机器可读时刻时产生 `data_warning`，不会猜测。
- 4B已增加 `data/transit-edges.json`。这里只维护名古屋站附近至主要区域、区域内高频连排点和关键景点餐厅关系，不建立34×34矩阵。
- `transit-edges.edges[]` 保存 `origin_id`、`destination_id`、`bidirectional` 与一个或多个 `options[]`。每个选项保存 `mode`、`operator_id`、线路、上下车站、换乘、参考分钟、步行分钟、成人普通票价、来源、官方时刻表来源、验证日期与可信度。
- `origin_id` / `destination_id` 可引用起点交通节点、正式景点或正式餐厅；验证脚本会检查引用、重复edge、运营方、来源、非负票价及合理时间。现有起点edge沿用稳定的历史节点ID，但公开名称和默认行为均为名古屋站。
- 正式连接优先于4A直线距离估算。未覆盖组合仍允许生成，但 `reference_quality` 必须为 `fallback_estimate`，前台明确提示现场用Google Maps确认。
- `transport.json` 的正式运营方式使用 `researched_transport`；尚未进入本阶段的机场线、JR与新干线使用 `future_scope`，不得被路线当作已核实连接。
- Google Maps按钮用于日本现场导航；高德按钮只打开目的地点供出发前预览；公共交通段的官方时刻表链接由 `sources.json` 的来源ID解析，不把URL散落在路线算法中。

### 4B正式路线输出

- `ordered_stops[]`：所选起点、景点、正式插入的餐厅与返回起点；保存内部分钟和父母版模糊时间标签。
- `segments[]`：相邻stop间的正式交通或明确标记的fallback；保存运营方、线路、站点、时间、步行、票价、来源及官方时刻表来源。
- `arranged_restaurants[]`：实际加入路线的用户已选或系统附近推荐餐厅；同一餐别最多一家。
- `restaurant_alternatives[]`：同餐别其余已选餐厅。
- `unarranged_restaurants[]`：因休业、餐别、Last Order、时间窗或跨区而未加入的餐厅及原因。
- `ticket_suggestions[]`：只有单买费用达到票券价格，或Me～guru预计达到3次时才提示。
- `transport_coverage`：正式连接与fallback段数量。
- `budget_estimate`：只统计正式排入的segment、景点与餐厅；未知费用另列，绝不按0处理。

正式排序在4A `recommended_subset` 内比较少量排列，综合开放时间、Last Order、正式转场、回头路及体力偏好。`trip-config.route_options.formal_route` 保存三餐目标时间、停留时间、排队规划缓冲和前台取整设置。排队缓冲只用于留余量，不表示预测真实等待分钟。

只有请求中的 `departure_day.is_departure_day` 为 `true` 时才启用离境日限制。`route_end_deadline` 为 `null` 时只能给保守风险提示；任何普通日期都不会因日期本身自动成为离境日。
