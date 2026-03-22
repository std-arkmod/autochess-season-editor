export interface AutoChessSeasonData {
    modeDataDict: { [key: string]: ModeDataDictMode }
    baseRewardDataList: BaseRewardDataList[]
    bandDataListDict: { [key: string]: BandDataListDict }
    charChessDataDict: { [key: string]: CharChessDataDict }
    chessNormalIdLookupDict: { [key: string]: string }
    diyChessDict: DiyChessDict
    shopLevelDataDict: ShopLevelDataDict
    shopLevelDisplayDataDict: { [key: string]: ShopLevelDisplayDataDict }
    charShopChessDatas: { [key: string]: CharShopChessData }
    trapChessDataDict: { [key: string]: TrapChessDataDict }
    trapShopChessDatas: { [key: string]: TrapShopChessData }
    stageDatasDict: { [key: string]: StageDatasDict }
    battleDataDict: BattleDataDict
    bondInfoDict: { [key: string]: BondInfoDict }
    garrisonDataDict: { [key: string]: GarrisonDataDict }
    effectInfoDataDict: { [key: string]: EffectInfoDataDict }
    effectBuffInfoDataDict: { [key: string]: EffectBuffInfoDataDict[] }
    effectChoiceInfoDict: { [key: string]: EffectChoiceInfoDict }
    bossInfoDict: { [key: string]: Boss }
    specialEnemyInfoDict: { [key: string]: SpecialEnemyInfoDict }
    enemyInfoDict: EnemyInfoDict
    specialEnemyRandomTypeDict: SpecialEnemyRandomTypeDict
    trainingNpcList: TrainingNpcList[]
    milestoneList: MilestoneList[]
    modeFactorInfo: ModeFactorInfo
    difficultyFactorInfo: DifficultyFactorInfo
    playerTitleDataDict: PlayerTitleDataDict
    shopCharChessInfoData: { [key: string]: ShopCharChessInfoDatum[] }
    constData: ConstData
}

export interface BandDataListDict {
    bandId: string
    sortId: number
    modeTypeList: ModeType[]
    bandDesc: string
    totalHp: number
    effectId: string
    victorCount: number
    bandRewardModulus: number
    updateTime?: number
}

export type ModeType = 'LOCAL' | 'SINGLE' | 'MULTI'

export interface BaseRewardDataList {
    round: number
    item: Item
    dailyMissionPoint: number
}

export interface Item {
    id: string
    count: number
    type: ItemType
}

export type ItemType =
    | 'ACTIVITY_ITEM'
    | 'GOLD'
    | 'MATERIAL'
    | 'CARD_EXP'
    | 'CHAR_SKIN'
    | 'PLAYER_AVATAR'

export interface BattleDataDict {
    [mode: string]: { [key: string]: ModeMultiFunnyElement[] }
}

export interface ModeMultiFunnyElement {
    bossId: null | string
    levelId: string
    isSpPrepare: boolean
}

export interface BondInfoDict {
    bondId: string
    name: string
    desc: string
    iconId: string
    activeCount: number
    effectId: string
    activeType: ActiveType
    activeCondition: ActiveCondition
    activeConditionTemplate:
        | 'count_threshold_upward'
        | 'count_threshold_upward_golden'
        | 'count_threshold_downward'
    activeParamList: string[]
    maxInactiveBondCount: number
    identifier: number
    weight: number
    isActiveInDeck: boolean
    descParamBaseList: string[]
    descParamPerStackList: string[]
    noStack: boolean
    chessIdList: string[]
}

export type ActiveCondition = 'BOARD_ALL_CHESS' | 'BOARD' | 'BOARD_AND_DECK'

export type ActiveType = 'BATTLE' | 'ALL' | 'MANI'

export interface Boss {
    bossId: string
    sortId: number
    weight: number
    bloodPoint: number
    bloodPointNormal: number
    bloodPointHard: number
    bloodPointAbyss: number
    isHidingBoss: boolean
}

export interface CharChessDataDict {
    chessId: string
    identifier: number
    isGolden: boolean
    status: CharChessDataDictStatus
    upgradeChessId: null | string
    upgradeNum: number
    bondIds: string[]
    garrisonIds: string[] | null
}

export interface CharChessDataDictStatus {
    evolvePhase: ShopCharChessInfoDatumEvolvePhase
    charLevel: number
    skillLevel: number
    favorPoint: number
    equipLevel: number
}

export type ShopCharChessInfoDatumEvolvePhase = 'PHASE_1' | 'PHASE_2'

export interface CharShopChessData {
    chessId: string
    goldenChessId: string
    chessLevel: number
    shopLevelSortId: number
    chessType: ChessType
    charId: null | string
    tmplId: null
    defaultSkillIndex: number
    defaultUniEquipId: null | string
    backupCharId: null | string
    backupTmplId: null
    backupCharSkillIndex: number
    backupCharUniEquipId: null | string
    backupCharPotRank: number
    isHidden: boolean
}

export type ChessType = 'PRESET' | 'NORMAL' | 'DIY'

export interface ConstData {
    shopRefreshPrice: number
    maxDeckChessCnt: number
    maxBattleChessCnt: number
    fallbackBondId: string
    storeCntMax: number
    costPlayerHpLimit: number
    milestoneId: string
    borrowCount: number
    dailyMissionParam: number
    dailyMissionName: string
    dailyMissionRule: string
    trstageBandId: string
    trstageBossId: string
    trStageId: string
    trainingModeId: string
    trSpecialEnemyTypes: TrSpecialEnemyTypeElement[]
    trBondIds: string[]
    trBannedBondIds: string[]
    milestoneTrackId: string
    // bandNextUpdateTs: number
    escapedBattleTemplateMapSinglePlayer: string
    escapedBattleTemplateMapMultiPlayer: string
    webBusType: string
}

export type TrSpecialEnemyTypeElement =
    | 'INVISIBLE'
    | 'FLY'
    | 'ELEMENT'
    | 'SPECIAL'
    | 'REFLECTION'
    | 'TIMES'
    | 'DOT'

export interface DifficultyFactorInfo {
    FUNNY: number
    NORMAL: number
    HARD: number
    ABYSS?: number
}

export interface DiyChessDict {
    chess_char_5_diy1_a: string
    chess_char_5_diy2_a: string
    chess_char_6_diy1_a: string
    chess_char_6_diy2_a: string
}

export interface EffectBuffInfoDataDict {
    key: string
    blackboard: Blackboard[]
    countType: Type
}

export interface Blackboard {
    key: string
    value: number
    valueStr: null | string
}

export type Type = 'NONE' | 'COUNTING'

export interface EffectChoiceInfoDict {
    choiceEventId: string
    choiceType: ChoiceType
    effectType: EffectType
    name: Name
    desc: Desc
    typeTxtColor: TypeTxtColor
}

export type ChoiceType = 'EQUIP_FREE' | 'BOUNTY_HUNT' | 'BUFF_SELECT' | 'PERSONAL_CHOOSE'

export type Desc =
    | '无需消耗资金，获得装备补给。'
    | '选定悬赏目标，获取额外奖励。'
    | '进行协同调整，做好迎战准备。'

export type EffectType =
    | 'EQUIP'
    | 'ENEMY_GAIN'
    | 'BUFF_GAIN'
    | 'BAND_INITIAL'
    | 'CHAR_MAP'
    | 'ENEMY'
    | 'BOND'

export type Name = '机密商店' | '悬赏决策' | '战术决策' | '道具补给'

export type TypeTxtColor = '#35d8b4' | '#f2bd3e'

export interface EffectInfoDataDict {
    effectId: string
    effectType: EffectType
    effectCounterType: Type
    continuedRound: number
    effectName: string
    effectDesc: string
    effectDecoIconId: EffectDecoIconID | null
    enemyPrice: number
}

export type EffectDecoIconID =
    | 'icon_team_buff'
    | 'icon_player_buff'
    | 'icon_enemy_debuff'
    | 'icon_boss_debuff'
    | 'icon_stage_buff'

export interface EnemyInfoDict {
    FLY: string[]
    TIMES: string[]
    ELEMENT: string[]
    DOT: string[]
    INVISIBLE: string[]
    REFLECTION: string[]
    SPECIAL: string[]
}

export interface GarrisonDataDict {
    garrisonDesc: string
    eventType: EventType
    eventTypeDesc: EventTypeDesc
    eventTypeIcon: EventTypeIcon
    eventTypeSmallIcon: EventTypeSmallIcon
    effectType: string
    charLevel: number
    battleRuneKey: BattleRuneKey | null
    blackboard: Blackboard[]
    description: string
}

export type BattleRuneKey =
    | 'env_gbuff_new_with_verify'
    | 'char_dynamic_ability_new'
    | 'give_garrison_to_front'
    | 'char_attribute_mul'
    | 'give_garrison_to_most_right'
    | 'give_garrison_to_all'

export type EventType =
    | 'IN_BATTLE'
    | 'SERVER_PRICE'
    | 'SERVER_CHESS_SOLD'
    | 'SERVER_GAIN'
    | 'SERVER_PREP_FIN'
    | 'SERVER_PREP_START'
    | 'SERVER_REFRESH_SHOP'

export type EventTypeDesc = '作战能力' | '整备能力' | '持续叠加' | '单次叠加' | '特异化' | '叠加'

export type EventTypeIcon = 'icon_battle' | 'icon_gold' | 'icon_bond' | 'icon_support'

export type EventTypeSmallIcon = 's_icon_battle' | 's_icon_gold' | 's_icon_bond' | 's_icon_support'

export interface MilestoneList {
    milestoneId: string
    milestoneLvl: number
    tokenNum: number
    rewardItem: Item
    availableTime: number
}

export interface ModeDataDictMode {
    modeId: string
    name: string
    code: string
    sortId: number
    backgroundId: string
    desc: string
    effectDescList: string[]
    preposedMode: null | string
    unlockText: null | string
    loadingPicId: string
    modeType: ModeType
    modeDifficulty: string
    modeIconId: string
    modeColor: string
    specialPhaseTime: number
    activeBondIdList: string[]
    inactiveBondIdList: string[]
    inactiveEnemyKey: string[]
    startTime?: number
}

export interface ModeFactorInfo {
    SINGLE: number
    MULTI: number
}

export interface PlayerTitleDataDict {
    comment_1: Comment
    comment_2: Comment
    comment_3: Comment
    comment_4: Comment
    comment_5: Comment
    comment_6: Comment
}

export interface Comment {
    id: string
    picId: string
    txt: string
}

export interface ShopCharChessInfoDatum {
    chessLevel: number
    isGolden: boolean
    evolvePhase: ShopCharChessInfoDatumEvolvePhase
    charLevel: number
    skillLevel: number
    favorPoint: number
    equipLevel: number
    purchasePrice: number
    chessSoldPrice: number
    eliteIconId: EliteIconID
}

export type EliteIconID = 'char_elite_base_1' | 'char_elite_gold_2' | 'char_elite_base_2'

export interface ShopLevelDataDict {
    [mode: string]: { [key: string]: ModeValue }
}

export interface ModeValue {
    shopLevel: number
    initialUpgradePrice: number
    charChessCount: number
    itemCount: number
    levelTagBgColor: LevelTagBgColor
}

export type LevelTagBgColor = '#434343' | '#626654' | '#445760' | '#615B74' | '#6C5E41' | '#5d341e'

export interface ShopLevelDisplayDataDict {
    shopLevel: number
    levelTagBgColor: LevelTagBgColor
    isLevelCharChessEmpty: boolean
    isLevelTrapChessEmpty: boolean
    charChessDiySlotIdList: string[] | null
}

export interface SpecialEnemyInfoDict {
    type: TrSpecialEnemyTypeElement
    specialEnemyKey: string
    randomWeight: number
    isInFirstHalf: boolean
    attachedNormalEnemyKeys: string[]
    attachedEliteEnemyKeys: string[]
}

export interface SpecialEnemyRandomTypeDict {
    SPECIAL: Dot
    FLY: Dot
    TIMES: Dot
    ELEMENT: Dot
    DOT: Dot
    INVISIBLE: Dot
    REFLECTION: Dot
}

export interface Dot {
    count: number
    weight: number
}

export interface StageDatasDict {
    stageId: string
    mode: string[]
    weight: number
}

export interface TrainingNpcList {
    npcId: string
    charId: string
    nameCardSkinId: string
    medalCount: number
    bandId: string
}

export interface TrapChessDataDict {
    chessId: string
    identifier: number
    charId: string
    isGolden: boolean
    purchasePrice: number
    status: TrapChessDataDictStatus
    upgradeChessId: null | string
    upgradeNum: number
    trapDuration: number
    effectId: string
    giveBondId: null | string
    givePowerId: null
    canGiveBond: boolean
    itemType: ItemTypeEnum
}

export type ItemTypeEnum = 'EQUIP' | 'MAGIC'

export interface TrapChessDataDictStatus {
    evolvePhase: PurpleEvolvePhase
    trapLevel: number
    skillIndex: number
    skillLevel: number
}

export type PurpleEvolvePhase = 'PHASE_0'

export interface TrapShopChessData {
    itemId: string
    goldenItemId: null | string
    hideInShop: boolean
    itemLevel: number
    iconLevel: number
    shopLevelSortId: number
    itemType: ItemTypeEnum
    trapId: string
}
