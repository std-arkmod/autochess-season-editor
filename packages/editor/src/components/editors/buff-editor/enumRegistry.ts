/**
 * Enum Registry — discovers and provides enum values for buff node properties.
 *
 * During game data scan, collects all unique values per property name globally.
 * After scan, properties with finite value sets are classified as enums and
 * exposed for Select dropdowns. No manual input fallback — game logic only
 * accepts these specific values.
 */

// ── Types ──

export interface EnumInfo {
  values: string[]
  /** Pre-built Mantine Select data with Chinese labels */
  options: { value: string; label: string }[]
  /** Pre-built Mantine Select data without labels (raw values only) */
  rawOptions: { value: string; label: string }[]
}

// ── State ──

const _valueCollector = new Map<string, Set<string>>()
const _enumMap = new Map<string, EnumInfo>()
let _finalized = false

// Known template keys for reference fields
let _allTemplateKeys: Set<string> | null = null

const TREE_KEYS = new Set(['$type', '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode', '_isAnd'])

// ── Chinese labels for enum values ──

const enumValueLabels: Record<string, Record<string, string>> = {
  // Target/source type enums (shared across many properties via TARGET_SOURCE_FAMILY)
  _targetType: {
    BUFF_OWNER: 'Buff拥有者',
    BUFF_SOURCE: 'Buff来源',
    SOURCE: '来源',
    TARGET: '目标',
    MAIN_TARGET: '主目标',
    MAINBUFF_SOURCE: '主Buff来源',
    MODIFIER_SOURCE: '修改器来源',
    MODIFIER_TARGET: '修改器目标',
    PROJECTILE_SOURCE: '弹道来源',
    PROJECTILE_TRACETARGET: '弹道追踪目标',
    ABILITY_OWNER: '技能拥有者',
    HP: '生命值',
    ALLY: '友方',
    ENEMY: '敌方',
  },
  _condType: {
    EQUALS: '等于',
    GT: '大于',
    GE: '大于等于',
    LT: '小于',
    LE: '小于等于',
  },
  _damageType: {
    PHYSICAL: '物理',
    MAGICAL: '法术',
    PURE: '真实',
    HEAL: '治疗',
    ELEMENT: '元素',
    NONE: '无',
  },
  _attackType: {
    NORMAL: '普通攻击',
    SPLASH: '溅射',
    ADDITION: '附加',
    BUFF: 'Buff',
    NONE: '无',
  },
  _applyWay: {
    ALL: '全部',
    MELEE: '近战',
    RANGED: '远程',
    NONE: '无',
  },
  _damageMask: {
    PHYSICAL: '物理',
    MAGICAL: '法术',
    PURE: '真实',
    ELEMENT: '元素',
    ANY_ATTACK: '任意攻击',
    ANY_ATTACK_EXCEPT_ELEMENT: '任意非元素攻击',
    PHYSICAL_AND_MAGICAL: '物理和法术',
    NONE: '无',
  },
  _sideMask: {
    ALLY: '友方',
    ENEMY: '敌方',
    BOTH_ALLY_AND_ENEMY: '友方和敌方',
    NEUTRAL: '中立',
  },
  _motionMode: {
    WALK: '地面',
    FLY: '飞行',
  },
  _motionMask: {
    ALL: '全部',
    WALK_ONLY: '仅地面',
    FLY_ONLY: '仅飞行',
    NONE: '无',
  },
  _direction: {
    UP: '上',
    DOWN: '下',
    LEFT: '左',
    RIGHT: '右',
    E_NUM: '枚举数',
  },
  _formulaType: {
    ADDITION: '加算',
    MULTIPLIER: '乘算',
    FINAL_ADDITION: '最终加算',
    FINAL_SCALER: '最终乘算',
  },
  _unitType: {
    CHARACTER: '干员',
    ENEMY: '敌人',
  },
  _lifeType: {
    IMMEDIATELY: '立即',
    HOLD_BY_BUFF: '跟随Buff',
    ALL_THE_TIME: '永久',
    UNTIL_NEXT_SPAWN: '至下次部署',
    UNTIL_NEXT_SPAWN_DECK_TRIGGER_ONCE: '至下次部署(触发一次)',
    UNTIL_NEXT_SPAWN_SYNC_WITH_BUFF: '至下次部署(同步Buff)',
  },
  _spMask: {
    ALL: '全部',
    INCREASE_WITH_TIME: '自动回复',
    INCREASE_WHEN_ATTACK: '攻击回复',
    INCREASE_WHEN_TAKEN_DAMAGE: '受击回复',
    ATTACK_OR_DAMAGE: '攻击或受击',
    NONE: '无',
  },
  _logType: {
    DEFAULT: '默认',
    NONE: '无',
    SIMPLE: '简要',
    DETAILED: '详细',
    HIDDEN_WAVE_START: '隐藏(波次开始)',
    HIDDEN_WAVE_END: '隐藏(波次结束)',
    ATTRIBUTE: '属性',
    CHARACTER_SKILL: '干员技能',
  },
  _channel: {
    CHARACTER: '干员',
    ENEMY: '敌人',
    LEVEL: '关卡',
    AUTOCHESS: '卫戍协议',
    ROGUELIKE: 'Roguelike',
  },
  _elementDamageType: {
    NONE: '无',
    FIRE: '灼燃',
    WATER: '侵蚀',
    DARK: '凋亡',
    SANITY: '神经',
  },
  _rangeTargetSideType: {
    ALLY: '友方',
    ENEMY: '敌方',
  },
  _attributeType: {
    ATK: '攻击力',
    DEF: '防御力',
    MAGIC_RESISTANCE: '法术抗性',
    ATTACK_SPEED: '攻击速度',
    HP_RATIO: '生命上限',
    MAX_HP: '最大生命值',
    HP_RECOVERY_PER_SEC: '每秒生命恢复',
    HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO: '每秒生命恢复(按最大生命比例)',
    EP_RECOVERY_PER_SEC: '每秒技力恢复',
    SP: '技力',
    SP_RECOVERY_PER_SEC: '每秒技力恢复',
    BLOCK_CNT: '阻挡数',
    COST: '费用',
    ABILITY_RANGE_FORWARD_EXTEND: '攻击范围前方扩展',
    DEF_PENETRATE: '防御穿透(百分比)',
    DEF_PENETRATE_FIXED: '防御穿透(固定)',
    MAGIC_RESIST_PENETRATE: '法术抗性穿透',
    MASS_LEVEL: '重量等级',
    MOVE_SPEED: '移动速度',
    TAUNT_LEVEL: '嘲讽等级',
    NONE: '无',
  },
  _ignoreMissFlag: {
    NONE: '无',
    PHYSICAL: '物理',
  },
  _allowedBuildableType: {
    ALL: '全部',
    MELEE: '近战位',
    NONE: '无',
  },
  _abnormalFlag: {
    PALSY: '麻痹',
    PALSYING: '正在麻痹',
    COLD: '寒冷',
    FROZEN: '冻结',
    LEVITATE: '浮空',
    FEARED: '恐惧',
    DISARMED: '缴械',
    DISARMED_COMBAT: '战斗缴械',
    INVISIBLE: '隐匿',
    INVINCIBLE: '无敌',
    CAMOUFLAGE: '迷彩',
    DOZE: '沉睡',
    HEAL_FREE: '无法治疗',
    ELEMENT_FREE_ALL: '元素免疫',
    SILENCED: '沉默',
    STUNNED: '晕眩',
    UNMOVABLE: '无法移动',
    UNDEADABLE: '无法不死',
    SKILL_NOT_ACTIVATABLE: '无法激活技能',
    SP_RECOVER_STOPPED: '技力停止恢复',
    E_NUM: '枚举数',
  },
  _sharedFlagIndex: {
    IS_CONTINUOUS: '是否持续',
    IS_ENVIRONMENT_DAMAGE: '是否环境伤害',
    DAMAGE_CAN_HURT_SLEEPING_ENTITY: '伤害可以打醒沉睡单位',
    DAMAGE_IS_UNDEADABLE_THIS_TIME: '此次伤害不可触发不死',
    HEAL_CAN_GENERAL_SHIELD: '治疗可以生成护盾',
  },
  _filterType: {
    ALL: '全部',
    NEAREST_TO_TARGET: '最近目标',
    DIST_TO_SOURCE_ASC: '距来源从近到远',
    HATRED_DES: '仇恨从高到低',
  },
  _applyWayFilter: {
    ALL: '全部',
    MELEE: '近战',
    RANGED: '远程',
    NONE: '无',
  },
  _attackTypeFilter: {
    NORMAL: '普通攻击',
    SPLASH: '溅射',
    ADDITION: '附加',
    BUFF: 'Buff',
    NONE: '无',
  },
  _ignoreCancelReasonMask: {
    NONE: '无',
    MISS: '未命中',
    'MISS, BLOCKED, BLOCKED_WITH_DAMAGE_NUMBER': '未命中/被阻挡(含伤害数字)',
    'MISS, BLOCKED, BLOCKED_WITH_DAMAGE_NUMBER, HIT_FAILED': '全部忽略',
  },
  _reason: {
    NONE: '无',
    MISS: '未命中',
    BLOCKED: '被阻挡',
    BLOCKED_WITH_DAMAGE_NUMBER: '被阻挡(显示伤害)',
    HIT_FAILED: '命中失败',
    INTERRUPT: '被打断',
    UNHURTABLE: '无法伤害',
  },
  _finishReason: {
    HP_ZERO: '生命归零',
    HP_ZERO_WITH_NO_SOURCE: '生命归零(无来源)',
    WITHDRAW: '撤退',
    SILENT_WITHDRAW: '静默撤退',
    PALSY: '麻痹',
    FROZEN: '冻结',
    LEVITATE: '浮空',
    FALLDOWN: '坠落',
    REACH_EXIT: '到达出口',
    NORMAL_EXIT: '正常退出',
    INTERRUPTED: '被打断',
    OWNER_DEAD: '拥有者死亡',
    MOVE_LIKE_RESPAWN_SELF: '移动式重新部署',
    RESPAWN_SELF: '自身重新部署',
    REPLACED: '被替换',
    OTHER: '其他',
    ABILITY_INTERRUPT: '技能打断',
    ABILITY_FINISH: '技能结束',
    SKILL_FINISH: '技能完成',
    ALL: '全部',
    NONE: '无',
  },
  _passableMask: {
    ALL: '全部可通过',
    FLY_ONLY: '仅飞行可通过',
    WALK_ONLY: '仅地面可通过',
    NONE: '不可通过',
  },
  _sourceApplyWay: {
    ALL: '全部',
    MELEE: '近战',
    RANGED: '远程',
    NONE: '无',
  },
  _charFrom: {
    PLAYER: '玩家',
    SUMMON: '召唤',
    BUFF_OWNER: 'Buff拥有者',
    BUFF_SOURCE: 'Buff来源',
  },
  _checkMotionMode: {
    WALK: '地面',
    FLY: '飞行',
    ALL: '全部',
    FLY_ONLY: '仅飞行',
    WALK_ONLY: '仅地面',
  },
  _rechargeTiming: {
    ATTACK: '攻击回复',
    TIME: '自动回复',
    NORMAL: '普通',
    ON_FINISH: '结束时',
  },
  _mountPoint: {
    BODY: '身体',
    FRONT: '前方',
    HEAD: '头部',
    FOOT: '脚部',
    BACK: '背后',
    CENTER: '中心',
    CUSTOM: '自定义',
    MUZZLE: '枪口',
    GROUND: '地面',
    HIT: '命中点',
    SPECIAL_5: '特殊5',
    SPECIAL_6: '特殊6',
  },
  _buildableType: {
    ALL: '全部',
    MELEE: '近战位',
    RANGED: '远程位',
    NONE: '无',
  },
  _familyGroupMask: {
    ALL: '全部',
    MELEE: '近战',
    RANGED: '远程',
    NONE: '无',
    ATTACK: '攻击',
    COMBAT: '战斗',
    ATTACK_OR_COMBAT: '攻击或战斗',
    SKILL: '技能',
  },
  _actionTargetType: {
    BUFF_OWNER: 'Buff拥有者',
    BUFF_SOURCE: 'Buff来源',
    SOURCE: '来源',
    TARGET: '目标',
    MAIN_TARGET: '主目标',
    MODIFIER_SOURCE: '修改器来源',
    MODIFIER_TARGET: '修改器目标',
    HOST: '宿主',
    STANDS: '驻场单位',
    STANDS_EXCEPT_SELF: '驻场单位(除自身)',
    SELF_WITH_HOST_AS_SOURCE: '自身(宿主为来源)',
  },
  _sharedFlag: {
    IS_CONTINUOUS: '是否持续',
    IS_ENVIRONMENT_DAMAGE: '是否环境伤害',
  },
  _ev: {
    ON_BUFF_START: 'Buff开始',
    ON_BUFF_FINISH: 'Buff结束',
    ON_BUFF_TRIGGER: 'Buff触发',
    ON_BUFF_ENABLE: 'Buff启用',
    ON_HIT_OBJECT: '命中物体',
    ON_REACHED_TARGET: '到达目标',
    ON_HIT_TILE: '命中地格',
    ON_PROJECTILE_STOP: '弹道停止',
  },
  _tileType: {
    NONE: '无',
    None: '无',
    Empty: '空',
    WALL: '墙',
    ROAD: '路',
    FLOOR: '地板',
    HOLE: '空洞',
    FENCE: '围栏',
    TUNNEL: '通道',
    GRASS: '草地',
    DEEPSEA: '深水',
    HEALING: '治疗',
    INFECTION: '感染',
    REED_TILE: '芦苇',
    Camp: '营地',
    Anchor: '锚点',
    Pure: '净化',
    Carp: '鲤',
    Trigger: '触发器',
    Highland: '高台',
    Food: '食物',
    Fortune: '财富',
  },
  _specialBuffSource: {
    BUFF_OWNER: 'Buff拥有者',
    BUFF_SOURCE: 'Buff来源',
    MODIFIER_SOURCE: '修改器来源',
    MODIFIER_TARGET: '修改器目标',
  },
  _abilityOwner: {
    BUFF_OWNER: 'Buff拥有者',
    SOURCE: '来源',
    BUFF_SOURCE: 'Buff来源',
  },
  // Blackboard key enums
  _multiplierKey: {
    atk_scale: '攻击倍率',
    atk_scale_extra: '额外攻击倍率',
    boss: 'Boss系数',
    boss_value: 'Boss数值',
    cnt: '计数',
    layer: '层数',
    speed_scale: '速度倍率',
    value: '数值',
    proj_atk_scale_1: '弹道攻击倍率1',
    proj_atk_scale_2: '弹道攻击倍率2',
  },
  _cachedAtkKey: {
    atk: '攻击力',
    dmg: '伤害',
  },
  _countKey: {
    cnt: '计数',
    max_cnt: '最大计数',
    remaining_cnt: '剩余计数',
  },
  _cntKey: {
    ammo_cnt: '弹药数',
    charge_cnt: '充能数',
    cnt: '计数',
    recharge_cnt: '充能次数',
  },
  _partName: {
    head: '首',
    left_hand: '左爪',
    right_hand: '右爪',
    tail: '尾',
  },
  _groupTag: {
    abyssal: '深海猎人',
    karlan: '喀兰贸易',
    kazimierz: '卡西米尔',
    laterano: '拉特兰',
    lungmen: '龙门',
    mujica: 'Ave Mujica',
    rhine: '莱茵生命',
    sargon: '萨尔贡',
    student: '乌萨斯学生自治团',
    sui: '岁',
    yan: '炎',
  },
  _additionValueKey: {
    damage: '伤害',
  },
  _loadCurModeBbKey: {
    last_mode: '上次模式',
    next_mode: '下次模式',
  },
  // ── Nested object fields (inside _buff etc.) ──
  statusResistable: {
    AUTOMATIC: '自动',
    YES: '可抵抗',
    NO: '不可抵抗',
  },
  overrideType: {
    DEFAULT: '默认',
    STACK: '叠加',
    UNIQUE: '唯一',
    EXTEND: '延长',
    EXTEND_TIME: '延长时间',
  },
  onEventPriority: {
    DEFAULT: '默认',
    HIGHER_PRIORITY: '更高优先',
    HIGH_PRIORITY: '高优先',
    LOW_PRIORITY: '低优先',
    LOWEST_PRIORITY: '最低优先',
    LOWER_PRIORITY: '较低优先',
    TITI_DOZE_PRIORITY: '提提沉睡优先',
  },
  lifeTimeType: {
    LIMITED: '有限时间',
    INFINITY: '永久',
    IMMEDIATELY: '立即',
  },
  triggerLifeType: {
    IMMEDIATELY: '立即',
    INFINITY: '永久',
    LIMITED: '有限时间',
  },
  targetSide: {
    ALLY: '友方',
    ENEMY: '敌方',
    ALL: '全部',
    BOTH_ALLY_AND_ENEMY: '友方和敌方',
    NONE: '无',
  },
  targetMotion: {
    ALL: '全部',
    WALK_ONLY: '仅地面',
    FLY_ONLY: '仅飞行',
    NONE: '无',
  },
  targetCategory: {
    DEFAULT: '默认',
    'DEFAULT, TRAP_OR_ITEM': '默认/陷阱/道具',
    'DEFAULT, TRAP_OR_ITEM, OBSTACLE': '默认/陷阱/道具/障碍',
    NONE: '无',
    TRAP_OR_ITEM: '陷阱/道具',
  },
  cardEffectType: {
    NONE: '无',
    DEVOURED: '吞噬',
    UNDEPLOYABLE: '不可部署',
    CHOSEN_ONE: '天选之人',
    TAUNT: '嘲讽',
    WTRMAN_DISTURB: '流形干扰',
    RL5_RELIC_CARDG: 'RL5收藏品',
  },
  purposeMask: {
    NONE: '无',
    HEAL: '治疗',
    DAMAGE: '伤害',
    EP_DAMAGE: '元素损伤',
  },
  abnormalFlag: {
    STUNNED: '晕眩',
    FROZEN: '冻结',
    INVISIBLE: '隐匿',
    CAMOUFLAGE: '迷彩',
    E_NUM: '枚举数',
  },
  excludeAbnormalFlag: {
    STUNNED: '晕眩',
    FROZEN: '冻结',
    CAMOUFLAGE: '迷彩',
    MOTION_TARGET_FREE: '移动目标自由',
  },
  // ── New enum entries from audit ──
  _compareType: {
    EQUALS: '等于',
    GT: '大于',
    GE: '大于等于',
    LT: '小于',
    LE: '小于等于',
  },
  _elementType: {
    NONE: '无',
    FIRE: '灼燃',
    WATER: '侵蚀',
    DARK: '凋亡',
    SANITY: '神经',
  },
  _blockMode: {
    WALK: '地面',
    FLY: '飞行',
    E_NUM: '枚举数',
  },
  _advancedBuildableMask: {
    DEFAULT: '默认',
    NONE: '无',
    DEEP_SEA: '深水',
    NIGHT: '夜间',
    RIDGE_FIELD: '山脊',
    ENEMY_FTPRG: '敌方堡垒',
    WOODRD_HOLE: '树洞',
  },
  _postFilter: {
    DIST_TO_SOURCE_ASC: '距来源从近到远',
    HATRED_DES: '仇恨从高到低',
    HATRED_DES_SLEEPING_LAST_EXCLUDE_SLEEP_IMMUNE: '仇恨降序(沉睡靠后/排除沉睡免疫)',
  },
  _modifierTargetType: {
    HP: '生命值',
    SP: '技力',
    EP: '元素损伤',
    COST: '费用',
    LIFE_POINT: '生命点',
  },
  _operation: {
    INDEX: '索引',
    DEC_INDEX: '递减索引',
    FLIP_BOOL: '翻转布尔',
  },
  _heightType: {
    HIGHLAND: '高台',
    LOWLAND: '地面',
  },
  _sideType: {
    ALLY: '友方',
    ENEMY: '敌方',
  },
  _targetLevelType: {
    NORMAL: '普通',
    ELITE: '精英',
    BOSS: 'Boss',
  },
  _infoType: {
    CURRENT_BOSS_WAVE: '当前Boss波次',
    CURRENT_WAVE_CHAR_USE: '当前波次使用干员数',
    EXISTING_TIME: '存在时间',
    MAX_BOSS_WAVE: '最大Boss波次',
    UNIQUE_ID: '唯一ID',
  },
  _faceType: {
    FRONT: '前方',
    BACK: '后方',
  },
  _recoveryType: {
    FIRE: '灼燃',
    DARK: '凋亡',
    SANITY: '神经',
  },
  _judgeType: {
    EQUAL: '相等',
    OPPOSITE: '对面',
    FACE_TARGET: '面向目标',
    VERTICAL: '垂直',
  },
  _spType: {
    INCREASE_WHEN_ATTACK: '攻击回复',
    INCREASE_WHEN_TAKEN_DAMAGE: '受击回复',
  },
  _saveType: {
    HP: '生命值',
    LOST_HP: '损失生命值',
  },
  _skillType: {
    AUTO: '自动',
    MANUAL: '手动',
    PASSIVE: '被动',
  },
  _gameResult: {
    WIN: '胜利',
    LOSE: '失败',
  },
  _sandboxSeasonTypeV2: {
    NONE: '无',
    DRY: '旱季',
    RAINY: '雨季',
  },
  _formulaItemType: {
    ADDITION: '加算',
    MULTIPLIER: '乘算',
    FINAL_SCALER: '最终乘算',
  },
  _professionMask: {
    PIONEER: '先锋',
    WARRIOR: '近卫',
    TANK: '重装',
    SNIPER: '狙击',
    CASTER: '术师',
    MEDIC: '医疗',
    SUPPORT: '辅助',
    SPECIAL: '特种',
    TOKEN: '召唤物',
  },
  _actionType: {
    DRAG: '拖拽',
    FOLLOW_BOSS: '跟随Boss',
    MOVE_AND_CREATEBUFF: '移动并创建Buff',
    MOVE_AND_DRAG_SOURCE: '移动并拖拽来源',
    MOVE_AND_SPAWNENEMY: '移动并生成敌人',
    MOVE_TO_CREATE_BUFF: '移至目标创建Buff',
    MOVE_TO_DRAG: '移至目标拖拽',
    MOVE_TO_ORIGIN: '移至原点',
  },
  _audioType: {
    Depressed: '低落',
    Enthusiastic: '高昂',
    None: '无',
  },
  _advancedShowType: {
    NONE: '无',
    USE_BLACKBOARD_DELTA_AS_ADDTION: '使用黑板增量作为加法',
    USE_BLACKBOARD_DELTA_AS_RATIO: '使用黑板增量作为比例',
  },
  _detailType: {
    CATCHED: '捕获',
    CATCHED_SHINING: '捕获(闪光)',
    STOLEN: '偷取',
  },
  _cardType: {
    NULL: '空',
    PENDING: '待定',
    USED: '已使用',
  },
  _cardState: {
    RESPAWNING: '重新部署中',
  },
  _cardLibraryType: {
    USING: '使用中',
  },
  _color: {
    BLACK: '黑色',
  },
  _category: {
    DEFAULT: '默认',
    TRAP_OR_ITEM: '陷阱/道具',
  },
  _checkType: {
    SAME: '相同',
    OPPOSITE: '对面',
    MAP_POSITION: '地图位置',
  },
  _difficultyMode: {
    FUNNY: '趣味模式',
  },
  _calcType: {
    MUL: '乘法',
  },
  _animation: {
    Idle: '待机',
    on: '开启',
    off: '关闭',
  },
  _epType: {
    NONE: '无',
    DARK: '凋亡',
    SANITY: '神经',
  },
  _buildableMask: {
    DEFAULT: '默认',
    DEEP_SEA: '深水',
    NIGHT: '夜间',
  },
  _buffAttributeType: {
    ATK: '攻击力',
    DEF: '防御力',
    MAX_HP: '最大生命值',
  },
  _buffType: {
    MAIN_BUFF: '主Buff',
  },
  _affectType: {
    Exp: '经验',
    ExpBook: '经验书',
  },
  _expType: {
    ENEMY_KILLED: '击杀敌人',
    TRAP_GAINED: '陷阱获取',
  },
  _faceIfSameCol: {
    FRONT: '前方',
    BACK: '后方',
    NONE: '无',
  },
  _fireworkType: {
    RED: '红色',
    BLUE: '蓝色',
    GREEN: '绿色',
    YELLOW: '黄色',
  },
  _gainToCardType: {
    PENDING: '待定',
    USING: '使用中',
  },
  _gameModeType: {
    ACT_5_FUN: '趣味活动',
    ENEMY_DUEL: '敌方对决',
  },
  _ignoredAdvancedBuildMask: {
    DEFAULT: '默认',
    WOODRD_HOLE: '树洞',
  },
  _position: {
    COST_PANAL: '费用面板',
    TOP_BAR: '顶部栏',
  },
  _professionCategory: {
    PIONEER: '先锋',
    WARRIOR: '近卫',
    TANK: '重装',
    SNIPER: '狙击',
    CASTER: '术师',
    MEDIC: '医疗',
    SUPPORT: '辅助',
    SPECIAL: '特种',
    NONE: '无',
  },
  _selectCardType: {
    DISCARD: '弃牌',
    NULL: '空',
    SELL: '出售',
  },
  _selectOrder: {
    FROM_RIGHT: '从右侧',
    NEXT_TO_LEFT: '向左侧',
  },
  _sharedFlags: {
    IS_ENVIRONMENT_DAMAGE: '环境伤害',
    IS_ENVIRONMENT_ELEMENT_DAMAGE: '环境元素伤害',
    DAMAGE_WITHOUT_MODIFY: '无修正伤害',
    INSTANT_KILL_LIKE_DAMAGE: '类即死伤害',
  },
  _side: {
    ALLY: '友方',
    ENEMY: '敌方',
  },
  _sourceAttributeType: {
    ATK: '攻击力',
    DEF: '防御力',
    MAX_HP: '最大生命值',
  },
  _sourceSideType: {
    ALLY: '友方',
    ENEMY: '敌方',
  },
  _spawnedTokenSideType: {
    ALLY: '友方',
    ENEMY: '敌方',
    NONE: '无',
  },
  _targetLevelMask: {
    BOSS: 'Boss',
    ELITE_AND_BOSS: '精英和Boss',
    ELITE_AND_NORMAL: '精英和普通',
  },
  _targetSide: {
    ALLY: '友方',
    ENEMY: '敌方',
    NEUTRAL: '中立',
  },
  _type: {
    NONE: '无',
    ENEMY: '敌人',
    TRAP: '陷阱',
    MOVE: '移动',
    WAIT_FOR_SECONDS: '等待秒数',
    FILTER_TAGS: '筛选标签',
    BUFF_KEY_MATCH_AND: 'Buff键匹配(与)',
  },
  _uiType: {
    NORMAL: '普通',
    STEAL: '偷取',
  },
  _validSource: {
    ALL: '全部',
    ENEMY: '敌方',
  },
  abnormalCombo: {
    SLEEPING: '沉睡',
    E_NUM: '枚举数',
  },
  gameStage: {
    STAGE_BATTLE: '战斗阶段',
    STAGE_CHOSEN: '选择阶段',
  },
  moveCostCompareType: {
    EQUALS: '等于',
    LT: '小于',
  },
  // ── Remaining enum properties from comprehensive audit ──
  _recordType: {
    hp: '生命值',
    hpRatio: '生命比例',
    maxHp: '最大生命值',
  },
  _roundType: {
    Floor: '向下取整',
    Round: '四舍五入',
  },
  _racingMode: {
    Racing: '竞速',
    Recover: '恢复',
  },
  _state: {
    LOCKED: '锁定',
  },
  _speedLevel: {
    FAST: '快速',
  },
  _gemsType: {
    Polluted: '被污染的结晶',
  },
  _healType: {
    DAMAGE_SCALE: '伤害倍率',
  },
  _infoMask: {
    KEEP_REVEALED: '保持显示',
  },
  _mask: {
    IN_SPECIAL_BUILD: '特殊部署中',
  },
  _mode: {
    FLY: '飞行',
    WALK: '地面',
  },
  _playerSide: {
    DEFAULT: '默认',
  },
  _rarity: {
    ALL: '全部',
  },
  _reasonMask: {
    OWNER_SETTING: '拥有者设定',
  },
  _seType: {
    DEFAULT: '默认',
  },
  _mountPointType: {
    UI: '界面',
  },
  _sandboxNodeTypeV2: {
    HOME: '驻扎地',
  },
  _zoneType: {
    SP: '技力',
  },
  _targetAttackType: {
    PHYSICAL: '物理',
  },
  _targetBuildableType: {
    RANGED: '远程位',
    MELEE: '近战位',
    ALL: '全部',
  },
  _targetCategory: {
    DEFAULT: '默认',
    TRAP_OR_ITEM: '陷阱/道具',
  },
  _targetHeightType: {
    HIGHLAND: '高台',
    LOWLAND: '地面',
  },
  _targetMotion: {
    WALK_ONLY: '仅地面',
    FLY_ONLY: '仅飞行',
    ALL: '全部',
  },
  _targetTileType: {
    Empty: '空',
    LOWLAND: '地面',
    HIGHLAND: '高台',
  },
  _TileTypesMask: {
    END: '终点',
    NONE: '无',
  },
  _toastType: {
    ENEMY: '敌方',
  },
  _toastTypeRL05: {
    GOLD_STEAL: '偷取金币',
  },
  _motionModeToCheck: {
    WALK: '地面',
    FLY: '飞行',
  },
  _showType: {
    FROM_BRANCH: '来自分支',
  },
  _scoreType: {
    Behind: '落后',
  },
  _score: {
    ADVANCE: '晋级',
    BASIC: '基础',
  },
  _routeCheckpointMask: {
    MOVE: '移动',
  },
  _mainActionType: {
    MOVE_AND_SPAWNENEMY: '移动并生成敌人',
  },
  _gainType: {
    SCORE: '分数',
  },
  _manuallyChangeCardState: {
    NONE: '无',
  },
  _abnormalCombo: {
    SLEEPING: '沉睡',
  },
  _uniDetailType: {
    CATCHED: '捕获',
    CATCHED_SHINING: '捕获(闪光)',
  },
  _compareValue: {
    UP: '上', DOWN: '下', LEFT: '左', RIGHT: '右',
    up: '上', down: '下', left: '左', right: '右',
    SIDE_A: 'A侧',
    left_hand: '左爪', none: '无',
    aura_on: '光环开启', depressed: '低落', enthusiastic: '高昂',
    true: '是', false: '否',
  },
  _ability: {
    Poison: '毒素',
  },
  _skinKey: {
    Default: '默认', default: '默认',
    Cut: '切割', RedBlade: '红刃', WhiteBlade: '白刃', YellowBlade: '黄刃',
    full: '满', half: '半', wand: '法杖',
  },
  // ── Nested object fields (additional) ──
  buildableType: {
    ALL: '全部',
    MELEE: '近战位',
    RANGED: '远程位',
    NONE: '无',
  },
  passableMask: {
    ALL: '全部可通过',
    NONE: '不可通过',
    FLY_ONLY: '仅飞行可通过',
    WALK_ONLY: '仅地面可通过',
  },
  lifeType: {
    ALL_THE_TIME: '永久',
    UNTIL_NEXT_SPAWN: '至下次部署',
    IMMEDIATELY: '立即',
    HOLD_BY_BUFF: '跟随Buff',
  },
  heightType: {
    HIGHLAND: '高台',
    LOWLAND: '地面',
  },
  direction: {
    UP: '上', DOWN: '下', LEFT: '左', RIGHT: '右',
  },
  loopType: {
    RANDOM: '随机',
  },
  phase: {
    PHASE_0: '阶段0',
  },
  advancedBuildableMask: {
    NONE: '无',
    DEFAULT: '默认',
  },
  tileTypesMask: {
    NONE: '无',
  },
  unitTypeMask: {
    NONE: '无',
  },
  professionMask: {
    NONE: '无',
    TOKEN: '召唤物',
    TRAP: '陷阱',
    PIONEER: '先锋',
    WARRIOR: '近卫',
    TANK: '重装',
    SNIPER: '狙击',
    CASTER: '术师',
    MEDIC: '医疗',
    SUPPORT: '辅助',
    SPECIAL: '特种',
  },
  blackboardKey: {
    cnt: '计数',
  },
  hostId: {
    enemy_1542_wdslm: '变形者集群',
  },
  _constDirection: {
    UP: '上', DOWN: '下', LEFT: '左', RIGHT: '右',
  },
  _profession: {
    PIONEER: '先锋', WARRIOR: '近卫', TANK: '重装', SNIPER: '狙击',
    CASTER: '术师', MEDIC: '医疗', SUPPORT: '辅助', SPECIAL: '特种',
    TOKEN: '召唤物', TRAP: '陷阱',
  },
  _queryProfessionCategory: {
    PIONEER: '先锋', WARRIOR: '近卫', TANK: '重装', SNIPER: '狙击',
    CASTER: '术师', MEDIC: '医疗', SUPPORT: '辅助', SPECIAL: '特种',
    NONE: '无',
  },
  _subProfessions: {
    craftsman: '工匠', stalker: '伏击客',
  },
  _tag: {
    abyssal: '深海猎人', kazimierz: '卡西米尔', water: '水',
  },
  _filterGroupId: {
    abyssal: '深海猎人', glasgow: '格拉斯哥帮',
  },
  _groupId: {
    rhine: '莱茵生命',
  },
  _targetGroupId: {
    rhine: '莱茵生命',
  },
  _toastTypeRL04: {
    DISASTER_CONTINUE: '灾难持续',
    GOLD_STEAL: '偷取金币',
    SKZDD_PREACH: '萨卡兹传教',
  },
  _sandboxWeatherType: {
    DRY: '干旱', RAINY: '雨季', NONE: '无',
  },
  _eventName: {
    event_on_carnival_finish: '嘉年华结束',
    event_on_carnival_start: '嘉年华开始',
    event_switch_to_clear: '切换至清除',
    event_take_damage_clear: '受伤清除',
    in_sleep_state: '进入沉睡',
    out_sleep_state: '脱离沉睡',
    trap_full: '陷阱已满',
    trap_not_full: '陷阱未满',
  },
  _bondId: {
    arcaneShip: '奥术', deputShip: '助力', egirShip: '阿戈尔',
    indomShip: '不屈', kazimierzShip: '卡西米尔', kjeragShip: '谢拉格',
    lateranoShip: '拉特兰', preciShip: '精准', raidShip: '突袭',
    sargonShip: '萨尔贡', siracusaShip: '叙拉古', skillfulShip: '灵巧',
    steadShip: '坚守', swiftShip: '迅捷', victoriaShip: '维多利亚',
    yanShip: '炎',
  },
  _blackboardPrefix: {
    avg_: '平均_', check_: '检查_', current_: '当前_', 'full.': '满',
    max_: '最大_', min_: '最小_', switch_: '切换_', target_: '目标_',
    vfx: '特效', xxx: '占位',
  },
  _spCostString: {
    cost: '费用', mana_max: '最大魔力', sp_cost: '技力消耗',
    sp_origin: '原始技力', sp_zero: '技力归零',
  },
  _blackboardKeyInAbility: {
    attack_speed: '攻击速度', cooldown: '冷却', first_trigger_interval: '首次触发间隔',
    move_speed: '移动速度', multi: '倍数', stun: '晕眩', value: '数值',
  },
  categoryMask: {
    TANK: '重装', SUPPORT: '辅助', WARRIOR: '近卫', SNIPER: '狙击',
    CASTER: '术师', MEDIC: '医疗', SPECIAL: '特种', PIONEER: '先锋',
  },
  cardAnimWhenDeckbuffAdd: {},
  _buffCnt: {
    cnt: '计数',
  },
  _countBB: {
    _: '(下划线)', bonus_cnt: '奖励计数', cnt: '计数',
    cnt_battle_item: '战斗道具数', cnt_resource: '资源数',
    cnt_battle_item_gras_bonus: '战斗道具数(草地加成)',
    cnt_battle_item_park_bonus: '战斗道具数(公园加成)',
    cnt_resource_gras_bonus: '资源数(草地加成)',
    cnt_resource_park_bonus: '资源数(公园加成)',
  },
  _buffMaxCnt: {
    max_cnt: '最大计数',
  },
  _force: {
    // mixed numeric + boolean
  },
  _randomOffset: {
    // mixed numeric + boolean
  },
  _dirBlackboard: {
    direction: '方向',
  },
  _hostAbilityName: {
    standRegisterList: '驻场注册列表',
  },
  _standAbilityName: {
    standRegisterList: '驻场注册列表',
  },
  _tileSelectorAbilityName: {
    FindCharacter: '寻找干员',
  },
  _rangeIdProjectileSize: {
    emit_count: '发射数',
  },
}

// Properties that share the same target/source enum family
const TARGET_SOURCE_FAMILY = new Set([
  '_targetType', '_sourceType', '_buffOwner', '_target', '_ownerType',
  '_source', '_excludeTargetType', '_damageSourceType', '_damageTargetType',
  '_healTarget', '_abilityOwnerType', '_buffSourceType', '_actionTargetType',
  // Additional members from audit
  '_soureceType', '_specifyBuffSource', '_host', '_sourcePosType',
  '_addBuffsSource', '_directionSourceType', '_target1', '_target2',
  '_owner', '_targetPosType', '_hpRatioSource', '_buffToEnemySourceType',
  '_enemyFrom', '_lhsType', '_rhsType', '_hostType', '_characterType',
  '_character', '_enemy', '_actionSource', '_buffSource', '_buffTarget',
  '_token', '_tokenType', '_shieldSource', '_getAtkTargetType', '_entity',
  // Single-value target/source props
  '_abilitySource', '_hostTargetType', '_modifierTarget', '_selectorOwnerType',
  '_selectorTarget', '_sourceTarget', '_startPointTarget', '_startPositionType',
  '_targetEnemyType', '_tileTargetType', 'm_sourceType', '_buffToEnemyTarget',
])

// ── Common blackboard key labels (shared fallback for *Key/*key properties) ──

const _commonBBKeyLabels: Record<string, string> = {
  // Core attributes
  atk: '攻击力', def: '防御力', max_hp: '最大生命值', hp: '生命值',
  hp_ratio: '生命比例', attack_speed: '攻击速度', move_speed: '移动速度',
  sp: '技力', cost: '费用', block_cnt: '阻挡数',
  magic_resistance: '法术抗性', ability_range_forward_extend: '攻击范围前方扩展',
  mass_level: '重量等级',
  // Scaling / multipliers
  atk_scale: '攻击倍率', damage_scale: '伤害倍率', heal_scale: '治疗倍率',
  damage: '伤害', damage_value: '伤害值', damage_resistance: '伤害减免',
  scale: '倍率', value: '数值', dynamic: '动态值', ratio: '比例',
  // Counts & stacks
  cnt: '计数', max_cnt: '最大计数', count: '计数', max_stack_cnt: '最大叠加数',
  stack_cnt: '叠加数', buff_cnt: 'Buff计数', times: '次数', max_times: '最大次数',
  hit_count: '命中次数', max_target: '最大目标数', init_stack_cnt: '初始叠加数',
  target_stack_cnt: '目标叠加数', buff_stack: 'Buff叠加',
  // Duration & timing
  duration: '持续时间', interval: '间隔', cooldown: '冷却', time: '时间',
  time_spend: '耗时', respawn_time: '再部署时间', stun_duration: '晕眩时间',
  shield_duration: '护盾时间', buff_duration: 'Buff持续时间',
  fly_duration: '飞行时间', height_duration: '高度时间',
  // Status effects (from gamedata_const)
  stun: '晕眩', silence: '沉默', cold: '寒冷', freeze: '冻结',
  sluggish: '停顿', cripple: '处决', sleep: '沉睡', force: '力',
  // Combat
  prob: '概率', shield: '护盾', max_shield: '最大护盾', direction: '方向',
  tag: '标签', cached_atk: '缓存攻击力', mode: '模式', state: '状态',
  enable: '启用', zero: '零', one: '一',
  // Resource
  eqp_count: '装备数', bond_stack_cnt: '羁绊叠加数',
  // Specific but common
  range_radius: '攻击范围半径', range_radius_addon: '攻击范围附加',
  ep_damage_ratio: '元素损伤比例', cost_scale: '费用倍率',
  disarmed_combat: '战斗缴械', cur_hp_ratio: '当前生命比例',
  part_name: '部件名', col: '列', row: '行',
  card_uid: '卡牌UID', score: '分数', next_mode: '下次模式',
  zero_mark: '零标记', killed: '击杀', hp_cur: '当前生命',
  curr_value: '当前值', multi: '倍数', target_cnt: '目标数',
  // Empty / special
  empty: '空', none: '无', _: '(下划线)', __: '(双下划线)', invalid: '无效',
}

// ── Collection (called during loadGameData scan) ──

export function collectPropertyValue(propKey: string, value: unknown): void {
  if (_finalized) return
  if (value === null || typeof value === 'object') return
  const str = String(value)
  let set = _valueCollector.get(propKey)
  if (!set) { set = new Set(); _valueCollector.set(propKey, set) }
  set.add(str)
}

/** Recursively collect all primitive field values inside a nested object (e.g. _buff). */
export function collectNestedValues(obj: Record<string, unknown>): void {
  if (_finalized) return
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') {
      if (!Array.isArray(v)) collectNestedValues(v as Record<string, unknown>)
      continue
    }
    const str = String(v)
    let set = _valueCollector.get(k)
    if (!set) { set = new Set(); _valueCollector.set(k, set) }
    set.add(str)
  }
}

/** Called once after game data scan completes. Analyzes collected values to build enum map. */
export function finalizeEnums(allTemplateKeys?: Set<string>): void {
  if (_finalized) return
  _finalized = true
  if (allTemplateKeys) _allTemplateKeys = allTemplateKeys

  for (const [propKey, valueSet] of _valueCollector) {
    if (TREE_KEYS.has(propKey)) continue
    const values = [...valueSet]

    if (values.length === 0) continue

    // Pure numeric properties (all values are integers or floats) should stay as
    // manual number inputs UNLESS they have explicit labels (intentional integer enums).
    const isAllNumeric = values.every(v => /^-?\d+(\.\d+)?$/.test(v))
    if (isAllNumeric && !enumValueLabels[propKey] && !TARGET_SOURCE_FAMILY.has(propKey)) continue

    const isIntEnum = values.every(v => /^-?\d+$/.test(v))

    {
      const sorted = isIntEnum
        ? values.sort((a, b) => Number(a) - Number(b))
        : values.sort()

      // Label lookup: specific labels → TARGET_SOURCE_FAMILY → common BB key fallback
      const isKeyProp = /[Kk]eys?$/.test(propKey) || /(?:Var|String|Scale|Bb|BB|Str)$/.test(propKey)
      const labelMap = enumValueLabels[propKey]
        ?? (TARGET_SOURCE_FAMILY.has(propKey) ? enumValueLabels._targetType : undefined)
        ?? (isKeyProp ? _commonBBKeyLabels : undefined)

      const options = sorted.map(v => {
        if (v === '') return { value: '', label: '(空)' }
        const cnLabel = labelMap?.[v]
        return { value: v, label: cnLabel ? `${cnLabel} (${v})` : v }
      })
      const rawOptions = sorted.map(v => {
        if (v === '') return { value: '', label: '(空)' }
        return { value: v, label: v }
      })

      _enumMap.set(propKey, { values: sorted, options, rawOptions })
    }
  }

  // Free collector memory
  _valueCollector.clear()
}

// ── Queries ──

/** Get enum info for a property, or null if not an enum */
export function getEnumInfo(propKey: string): EnumInfo | null {
  return _enumMap.get(propKey) ?? null
}

// Reference field property names (includes array parent keys like _buffKeys)
const REF_PROPS = new Set([
  '_key', '_buffKey', '_templateKey', '_targetBuffKey', 'templateKey',
  '_buffKeys', '_cardBuffKey',
])

/** Check if a property is a known buff reference field */
export function isRefProp(propKey: string): boolean {
  return REF_PROPS.has(propKey)
}

// ── Dynamic updates ──

// Snapshot of base game-data values for ref props, so we can re-merge cleanly
const _baseRefValues = new Map<string, string[]>()
let _lastUserKeys: string[] = []

/**
 * Merge user-created template keys into all REF_PROPS enum entries.
 * Call this whenever user's buffTemplates change (create/delete/rename).
 * Efficiently skips work if the key list hasn't changed.
 */
export function mergeUserTemplateKeys(userKeys: string[]): void {
  // Quick identity check — skip if same array reference or same contents
  if (userKeys === _lastUserKeys) return
  if (userKeys.length === _lastUserKeys.length && userKeys.every((k, i) => k === _lastUserKeys[i])) return
  _lastUserKeys = userKeys

  for (const propKey of REF_PROPS) {
    // Snapshot base values on first call
    if (!_baseRefValues.has(propKey)) {
      const existing = _enumMap.get(propKey)
      _baseRefValues.set(propKey, existing ? [...existing.values] : [])
    }

    const base = _baseRefValues.get(propKey)!
    const baseSet = new Set(base)
    // Add user keys that aren't already in base
    const merged = [...base]
    for (const k of userKeys) {
      if (k && !baseSet.has(k)) merged.push(k)
    }
    merged.sort()

    const options = merged.map(v => {
      if (v === '') return { value: '', label: '(空)' }
      return { value: v, label: v }
    })
    _enumMap.set(propKey, { values: merged, options, rawOptions: options })
  }
}
