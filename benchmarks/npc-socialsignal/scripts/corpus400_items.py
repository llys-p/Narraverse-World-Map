#!/usr/bin/env python3
"""Authored rows for corpus400-dev30-v1 (10 new families M01-M10, 30 items).

Authoring bar follows the control corrections on long-dev24:
  * trust moves only on CURRENT NPC-visible fulfillment/breach (R-8.5); old
    fulfillments are never re-counted; deadlines must be observable, otherwise
    不确定;
  * 无线索 requires a comparable visible fact; only collision-capable claims are
    有线索; irony and public re-wordings never count (R-8.1/R-8.2);
  * conditional boundaries need observable trigger criteria; ambiguous -> 信息不足
    (R-8.3); a request that touches a declared boundary already crosses it
    (R-8.4); accomplished crossing kept distinct; secrecy requests do not
    violate (R-8.6); direction-asking is graded (R-8.7);
  * evidence-loss items keep the obligation quantity ONLY in the oldest line;
    the present transaction reports the observed count and never the expected
    one; nothing is attributed as an NPC breach.
"""

PLAN_ID = "corpus400-dev30-v1"

P_M01 = "盐灶户老卤头，熬盐二十五年，守着自家三口盐锅；夜里看火从不含糊，警觉中高，最恨别人碰他的火道。"
B_M01 = "灶房火道三步之内不近人；看火可以，不许搭话搭手。"
P_M02 = "酒坊的蒸酒娘子阿糯，守着甑锅七年，手艺是亡父传的；话软规矩硬，警觉中，蒸酒的时辰天大的事都要等出甑。"
B_M02 = "蒸酒的时辰生人不进坊；酒头酒尾是奉官的，一滴不卖。"
P_M03 = "灯笼铺的祝师傅，糊了三十年纸灯笼，骨架端正；话不多，讲究极多，警觉中。"
B_M03 = "白事不糊红灯笼；赶工不过三更，三更一过就熄灯。"
P_M04 = "寿材铺的钱二叔，做了半辈子棺木，手艺沉得住气；不忌讳谈生死，忌讳坏了规矩，警觉中。"
B_M04 = "不与活人量寿材；铺里的墨斗尺不外借。"
P_M05 = "染坊管晒布的罗大娘，干了十八年，花色看得比命重；嗓门大心不坏，警觉高，晒场的布谁也不许近前翻动。"
B_M05 = "晒场的布不许生人近前翻动；花样本子不外借。"
P_M06 = "货栈守夜的聋伯，看了十五年夜栈，耳朵背眼睛尖；认票据不认人，警觉高，夜里栈门一关就是天。"
B_M06 = "夜里不开栈门；票据遗失只补登记，不补放货。"
P_M07 = "弹棉花的翁师傅，一张弓弹了二十二年，手上的茧比棉絮还厚；性子闷，讲究手艺人的体面，警觉中。"
B_M07 = "弹好的棉胎不给生人存；弓弦不借人拉。"
P_M08 = "茶棚说书的瞎先生，说了二十年书，记性比眼睛好用；耳音极灵，警觉高，底本就是他的命。"
B_M08 = "散场后不接私活；底本不出茶棚。"
P_M09 = "织坊的细妹，织了九年布，手快性子直；她娘留下的织机比嫁妆还金贵，警觉中。"
B_M09 = "机上布不预售；生人不许碰织机。"
P_M10 = "剃头挑子陆小刀，走街串巷八年，手稳嘴甜；行里的老讲究一样不落，警觉低。"
B_M10 = "白事孝子不动刀；天黑不剃头。"


def M01_items():
    return [
        # --- C400-D001 long cat0: current visible fulfillment -----------------
        {
            "sid": "E1-C400-001", "family": "M01", "rel": "salt_regular",
            "persona": P_M01, "boundary": B_M01,
            "history": [
                "大前年灶上换过一口新盐锅，老卤头请人抬了一上午。",
                "大前年老卤头教会了邻村一个后生看火色，那人后来改了行。",
                "大前年底灶上的盐锅结过一回厚锅巴，铲了半日。",
                "前年腊月官盐收价，灶上囤过两窑盐。",
                "前年夏天灶房的老井淘过一回深，提水省了半程。",
                "前年秋底盐价平了，老卤头把囤的盐出了一半。",
                "去年春天老卤头的婆子害了场寒热，歇灶五日。",
                "去年二月里一场倒春寒，灶上的水缸结了薄冰。",
                "去年夏初灶上的柴棚漏雨，晒了半个月的柴。",
                "去年五月里集上盐销得快，老卤头连着加了三夜火。",
                "去年七月伏天灶房热得站不住人，老卤头把活挪到清早。",
                "去年八月里婆子的娘家来人，灶上多蒸了几笼。",
                "去年秋末官牙来称过一回盐税，账目对得齐整。",
                "去年九月盐帮的船靠了岸，老卤头去帮着卸过盐包。",
                "去年冬天玩家替灶上从北山捎过一回引火的松明。",
                "去年冬底老卤头给灶王爷的龛换了块新红布。",
                "去年腊月里老卤头的婆子腌了两缸咸菜，送了邻里。",
                "今年正月里老卤头祭了灶，供的是自家熬的糖稀。",
                "今年正月里灶房门口贴了副新对联，是玩家写的。",
                "上个月柴市上柴价见涨，老卤头提前订下了三车。",
                "上个月玩家在灶上订下三车柴，讲定今晨送到。",
                "上个月中旬老卤头把灶前的石板擦洗了一遍。",
                "上个月底老卤头把三口锅的火道通掏了一遍。",
            ],
            "extra_history": [
                "今晨天刚亮，玩家把三车柴拉到灶房外的空场。",
                "老卤头一车一车过秤，三车斤两与讲定的一样。",
                "柴钱八十文，玩家当面数清放在秤旁。",
                "老卤头把柴码进棚里，给玩家舀了碗热水。",
            ],
            "turn": "老叔，柴照订数送到，钱也两讫了；往后灶上要用柴，赶早捎个话就行。",
            "labels": {"social_act": "合作", "trust_shift": "上升", "fear_shift": "不变",
                       "deception": "无线索", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "如约送柴、当面结钱，双向往来；§1 合作。",
                "trust_shift": "本次三车柴按订数送到并过秤收讫，是当前可见的履约；§2 上升/R-8.5。",
                "fear_shift": "送柴结钱无危险线索；§3 不变。",
                "deception": "柴的斤两过秤相符，老卤头亲手经手，可比对且一致；§4 无线索/R-8.2。",
                "boundary_violation": "柴卸在灶房外空场，人没近火道三步；§5 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["柴照订数送到", "钱也两讫了"],
                "trust_shift": ["讲定今晨送到", "三车斤两与讲定的一样", "当面数清放在秤旁"],
                "fear_shift": ["把柴码进棚里"],
                "deception": ["三车斤两与讲定的一样"],
                "boundary_violation": ["灶房火道三步之内不近人", "把三车柴拉到灶房外的空场"],
            },
            "tags": [PLAN_ID, "cat0_within_budget"], "len": "long",
            "notes": "长文本·预算内：既往全保留无截断；履约是本次的，不重复计旧账。",
        },
        # --- C400-D002 short: repeat debt, observable deadline passed ---------
        {
            "sid": "E1-C400-002", "family": "M01", "rel": "salt_regular",
            "persona": P_M01, "boundary": B_M01,
            "history": [
                "上个月玩家赊过两斤盐，讲定半个月内用柴抵清。",
                "老卤头的婆子数过日历，如今一个多月了，柴没见着。",
                "前年冬天老卤头也赊过人盐，那年腊月他自己也被赊过。",
            ],
            "extra_history": [
                "今早玩家又到灶前，说家里盐罐见底了。",
                "老卤头看了看柴棚，棚里还是空的。",
            ],
            "turn": "老叔，再赊两斤盐吧，这回连同上回的，我十天内一并拿柴来抵。",
            "labels": {"social_act": "求助", "trust_shift": "下降", "fear_shift": "不变",
                       "deception": "信息不足", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "求赊盐，请求通融；§1 求助。",
                "trust_shift": "上月之约以半个月为限，如今一个多月柴未见（棚空可见），本次到期可见未履；§2 下降/R-8.5。",
                "fear_shift": "赊盐求情无危险线索；§3 不变。",
                "deception": "「盐罐见底」无从当场核验；R-8.1 信息不足。",
                "boundary_violation": "人站在三步外求情，没近火道；§5 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["再赊两斤盐吧"],
                "trust_shift": ["讲定半个月内用柴抵清", "一个多月了，柴没见着", "棚里还是空的"],
                "fear_shift": ["又到灶前"],
                "deception": ["家里盐罐见底了"],
                "boundary_violation": ["灶房火道三步之内不近人", "又到灶前"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "截止可观察（半月→一个多月）+当前可见未履（柴棚空）→下降。",
        },
        # --- C400-D003 short: favor that touches the boundary (R-8.4) ---------
        {
            "sid": "E1-C400-003", "family": "M01", "rel": "salt_stranger",
            "persona": P_M01, "boundary": B_M01,
            "history": [
                "老卤头的火道上个月刚掏过一回灰。",
                "前日有个走街的铜匠在集上吹嘘过一种省柴的铁管。",
            ],
            "extra_history": [
                "今早玩家背着一节铁管到灶房门口，说懂灶火。",
                "玩家边说边往灶房里迈了半步。",
            ],
            "turn": "老叔，我这节铁管装进你的火道，一灶省三成柴；你让开，我进去两刻钟就给你装好。",
            "labels": {"social_act": "示好", "trust_shift": "不变", "fear_shift": "上升",
                       "deception": "信息不足", "boundary_violation": "已越过"},
            "basis": {
                "social_act": "主动送上门的省钱好处，无对价索求；§1 示好。",
                "trust_shift": "本次无守约或违约可比；R-8.5 不变。",
                "fear_shift": "生人执意要近火道动手，老卤头警觉中高，可见的危险直指灶房；§3 上升。",
                "deception": "「省三成柴」无从当场核验；R-8.1 信息不足。",
                "boundary_violation": "当面要求进灶房近火道动手，被要求即为触线；R-8.4 已越过。",
            },
            "decisive_evidence": {
                "social_act": ["一灶省三成柴", "我进去两刻钟就给你装好"],
                "trust_shift": ["我进去两刻钟就给你装好"],
                "fear_shift": ["往灶房里迈了半步", "我进去两刻钟就给你装好"],
                "deception": ["一灶省三成柴"],
                "boundary_violation": ["灶房火道三步之内不近人", "我进去两刻钟就给你装好"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "示好外壳+触线内容，内容优先（§0.2）；请求触线（R-8.4）。",
        },
    ]


def M02_items():
    return [
        # --- C400-D004 long cat1: repay before deadline, lore trimmed ---------
        {
            "sid": "E1-C400-004", "family": "M02", "rel": "brewery_regular",
            "persona": P_M02, "boundary": B_M02,
            "history": [
                "大前年阿糯的亡父在时，坊里一年只蒸八甑。",
                "大前年坊里的老井淘过一回，井水甜，酒也跟着甜。",
                "前年阿糯接手甑锅，头一甑酒酸了半锅，她哭了半宿。",
                "前年秋天坊前的桂花落满一地，阿糯扫了半日。",
                "前年冬天坊里的酒曲告急，是玩家引的粮行搭救。",
                "去年二月里雨水多，坊里的柴火潮了大半。",
                "去年春天坊里添了口二甑，出酒快了两日。",
                "去年四月初八庙会，坊前的酒摊摆出去一天。",
                "去年夏天官牙来收酒头酒尾，簿子上画了押。",
                "去年五月的梅雨天，阿糯把坊里的坛坛罐罐垫高了半尺。",
                "去年七月伏天蒸的酒最烈，老主顾都赶着这时节来。",
                "去年八月里漕船靠岸，坊里卖出去十来坛散酒。",
                "去年八月末阿糯给亡父上了坟，供了一盏新酒。",
                "去年九月里有人家嫁女，一口气订了六坛喜酒。",
                "去年秋末坊里的老酒坛裂了两口，阿糯糊了泥封。",
                "去年十月里官仓的差事下来，坊里替公家蒸过一甑。",
                "去年十一月里坊门口来了个尝酒的北边客商，没谈成。",
                "去年腊月里坊里封坛，泥封上按了阿糯的手印。",
                "去年冬天雪封路，坊里歇了两甑。",
                "去年冬底阿糯盘了一年的账，把赊欠的都记上吊板。",
                "上个月腊月里玩家赊过坊里一帖酒曲，讲定正月十五前还曲钱六十文。",
                "上个月底阿糯把酒曲钱的账记在吊板上。",
                "上个月底坊里的老狗添了窝崽，阿糯拿旧棉絮给垫了窝。",
                "上个月底阿糯把坊门口的旧灯笼摘下来洗了洗。",
                "今年正月初一坊里开了头一坛新酒。",
                "今年正月初五落了场小雪，坊前的石阶扫出一条道。",
                "今年正月初八里坊里的老鼠夹夹着一只，阿糯埋到了后园。",
                "今年正月里坊里的伙计回乡未归，阿糯一个人看坊。",
                "本月十五还没到，今日已是正月十二。",
                "坊前的老柳树还没冒芽。",
            ],
            "extra_history": [
                "今早玩家到坊里，把六十文曲钱当面点给阿糯。",
                "阿糯照吊板核了数目，一笔不差。",
                "阿糯给玩家灌了一小壶浆水路上喝。",
            ],
            "turn": "阿糯姐，曲钱如数奉还，你点点；离十五还早，账清了好过年。",
            "labels": {"social_act": "合作", "trust_shift": "上升", "fear_shift": "不变",
                       "deception": "无线索", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "按约还钱、当面结清，双向往来；§1 合作。",
                "trust_shift": "约定正月十五前还，今日十二、当面点清六十文，是当前可见的按约履约；§2 上升/R-8.5。",
                "fear_shift": "还钱寒暄无危险线索；§3 不变。",
                "deception": "还的数目与吊板所记相符，阿糯亲手核对，可比对且一致；§4 无线索/R-8.2。",
                "boundary_violation": "人在坊外账房前，蒸酒时辰未到；§5 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["曲钱如数奉还"],
                "trust_shift": ["讲定正月十五前还曲钱六十文", "今日已是正月十二", "当面点给阿糯"],
                "fear_shift": ["灌了一小壶浆水"],
                "deception": ["照吊板核了数目", "一笔不差"],
                "boundary_violation": ["蒸酒的时辰生人不进坊", "今早玩家到坊里"],
            },
            "tags": [PLAN_ID, "cat1_irrelevant_only_trimmed"], "len": "long",
            "notes": "长文本·只删背景：旧年坊中掌故可被截，履约与核对证据都在新块；截止可观察（十五前→今日十二）。",
        },
        # --- C400-D005 short: probing question inside the rule -----------------
        {
            "sid": "E1-C400-005", "family": "M02", "rel": "brewery_stranger",
            "persona": P_M02, "boundary": B_M02,
            "history": [
                "昨日有位外乡客在坊前打听过酒价。",
                "阿糯今日开坊卖酒，甑是冷的。",
            ],
            "extra_history": [
                "这会儿玩家在坊前站定，问起新酒的价。",
                "听到酒头酒尾不卖，玩家笑了笑没再缠。",
            ],
            "turn": "掌柜的，新酒怎么卖？——哦对了，都传说酒头最香，真一滴都匀不出来？",
            "labels": {"social_act": "中性", "trust_shift": "不变", "fear_shift": "不变",
                       "deception": "信息不足", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "问价闲谈，无施压无对价；§1 中性。",
                "trust_shift": "本次无守约违约可比；R-8.5 不变。",
                "fear_shift": "正常问价，无危险线索；§3 不变。",
                "deception": "「都传说酒头最香」是转述传闻，无从当场核验；R-8.1 信息不足。",
                "boundary_violation": "只是开口探问，被婉拒后未再求，属试探未触线；§5 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["新酒怎么卖"],
                "trust_shift": ["问起新酒的价"],
                "fear_shift": ["在坊前站定"],
                "deception": ["都传说酒头最香"],
                "boundary_violation": ["酒头酒尾是奉官的，一滴不卖", "笑了笑没再缠"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "试探与触线的分界：开口问≠要求（§5 未越过「含试探但未触线」）。",
        },
        # --- C400-D006 short: unidentifiable object, no words ------------------
        {
            "sid": "E1-C400-006", "family": "M02", "rel": "brewery_stranger",
            "persona": P_M02, "boundary": B_M02,
            "history": [
                "今晨阿糯开坊板，甑还没生火。",
                "昨日坊前没有人来订酒。",
            ],
            "extra_history": [
                "今早玩家在坊门槛上搁下一只铜哨，压了半张字条。",
                "字条上的字阿糯不认得。",
            ],
            "turn": "（玩家把铜哨往里推了推，拱了拱手，一言不发地走了。）",
            "labels": {"social_act": "不确定", "trust_shift": "不变", "fear_shift": "不确定",
                       "deception": "信息不足", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "只留一件阿糯看不懂的物件，无言语无行为指向；§1 不确定。",
                "trust_shift": "无可靠性主张可比；R-8.5 不变。",
                "fear_shift": "来历不明的物件加不认得的字条，阿糯无法评估来意；§3 不确定。",
                "deception": "无任何陈述可核；R-8.1 信息不足。",
                "boundary_violation": "物件放在坊外门槛，人未进坊；§5 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["搁下一只铜哨", "一言不发地走了"],
                "trust_shift": ["搁下一只铜哨"],
                "fear_shift": ["字条上的字阿糯不认得"],
                "deception": ["字条上的字阿糯不认得"],
                "boundary_violation": ["在坊门槛上", "把铜哨往里推了推"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "无言语话轮（可见行动描述）：social_act/fear 双不确定（§1/§3 正例）。",
        },
    ]


def M03_items():
    return [
        # --- C400-D007 long cat0: wedding lantern pickup ----------------------
        {
            "sid": "E1-C400-007", "family": "M03", "rel": "lantern_regular",
            "persona": P_M03, "boundary": B_M03,
            "history": [
                "大前年县里上元灯会，铺子出过四十盏走马灯。",
                "大前年冬底祝师傅给县衙的门楼糊过一对大灯。",
                "前年三月里一个小学徒进了门，先劈了半年竹篾。",
                "前年七月里一场大风揭了半边铺瓦，糊了一周灯。",
                "前年冬底竹料囤了两捆，是祝师傅亲自去山里挑的。",
                "去年二月里县里闹花灯，铺子门口挤满了娃娃。",
                "去年春天铺子换过一块新匾，是老主顾送的。",
                "去年五月里祝师傅改了浆糊的方子，灯面不返潮。",
                "去年七月里铺前的老槐树遮了光，祝师傅修剪了两枝。",
                "去年夏天学徒出师去了南街，铺里只剩师徒二人。",
                "去年八月里中秋灯订得多，师徒俩赶了十日。",
                "去年十月里扎灯笼的架子重新绷过线。",
                "去年冬底祝师傅把攒下的竹头分给了沿街的娃娃们做炮仗架。",
                "去年秋末县里办喜事的多，铺子赶了半月工。",
                "去年冬天祝师傅给孤老院送过十盏素灯，没收钱。",
                "去年冬底祝师傅眼上的翳又厚了些，糊灯全凭手感。",
                "今年正月初里铺子歇了三日，开了年再开工。",
                "上个月里学徒他娘捎来一双新布鞋，祝师傅让他换了。",
                "上个月玩家在铺里订下两对喜灯，讲定今晨来取付尾款。",
                "上个月里铺里的桐油添过一回，灯面更亮了。",
                "上个月底两对喜灯糊好了骨架，只等上色。",
                "铺门口的灯笼杆今年刚重新立过。",
            ],
            "extra_history": [
                "今晨玩家到铺，两对喜灯已挂在梁下等取。",
                "尾款一百文，玩家当面点清。",
                "祝师傅把灯用棉纸裹好，交到玩家手里。",
            ],
            "turn": "祝师傅，尾款你点收，灯扎得周正，回头喜事办完给你送喜饼。",
            "labels": {"social_act": "合作", "trust_shift": "上升", "fear_shift": "不变",
                       "deception": "无线索", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "订灯取灯、当面结款，双向对价；§1 合作。",
                "trust_shift": "讲定今晨取灯付尾款，本次当面点清一百文，是当前可见履约；§2 上升/R-8.5。",
                "fear_shift": "取灯道谢无危险线索；§3 不变。",
                "deception": "尾款与讲定数目相符，祝师傅当面点过；§4 无线索/R-8.2。",
                "boundary_violation": "取的是喜灯，天光大，未过三更；§5 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["尾款你点收"],
                "trust_shift": ["讲定今晨来取付尾款", "当面点清"],
                "fear_shift": ["挂在梁下等取"],
                "deception": ["尾款一百文", "当面点清"],
                "boundary_violation": ["白事不糊红灯笼", "两对喜灯"],
            },
            "tags": [PLAN_ID, "cat0_within_budget"], "len": "long",
            "notes": "长文本·预算内；喜灯与「白事不糊红灯」的界不冲突。",
        },
        # --- C400-D008 short: secrecy request is not a violation (R-8.6) ------
        {
            "sid": "E1-C400-008", "family": "M03", "rel": "lantern_stranger",
            "persona": P_M03, "boundary": B_M03,
            "history": [
                "祝师傅铺里白事素灯常年有现货。",
                "昨日前街有位老人家过身，丧家贴了白联。",
            ],
            "extra_history": [
                "今早玩家来订一盏白事用的白灯笼，付了定钱二十文。",
                "玩家压低声音，求祝师傅别对外说灯是他订的。",
            ],
            "turn": "师傅，白灯给我留一盏，钱我付过了；只是这事你别往外说，我家里还有长辈。",
            "labels": {"social_act": "合作", "trust_shift": "不确定", "fear_shift": "不变",
                       "deception": "信息不足", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "订灯付定，议定买卖；§1 合作。",
                "trust_shift": "本次只付了定钱这一对价，取灯尚无兑现动作可比；R-8.5 不确定。",
                "fear_shift": "订白灯无危险线索；§3 不变。",
                "deception": "「家里还有长辈」无从当场核验；R-8.1 信息不足。",
                "boundary_violation": "求保密不触「白事不糊红灯」——白灯本就是白事所用；R-8.6 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["订一盏白事用的白灯笼", "付了定钱二十文"],
                "trust_shift": ["付了定钱二十文"],
                "fear_shift": ["压低声音"],
                "deception": ["我家里还有长辈"],
                "boundary_violation": ["白事不糊红灯笼", "白事用的白灯笼"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "R-8.6：求缄默≠触界。",
        },
        # --- C400-D009 short: after-curfew rush request -----------------------
        {
            "sid": "E1-C400-009", "family": "M03", "rel": "lantern_stranger",
            "persona": P_M03, "boundary": B_M03,
            "history": [
                "祝师傅的铺子三更熄灯的规矩挂了二十年。",
                "昨夜镇上爆竹响到二更才歇。",
            ],
            "extra_history": [
                "今夜三更的梆子刚敲过，铺门被叩响。",
                "玩家立在门外，说有一盏灯明日一早要用。",
            ],
            "turn": "祝师傅，开开门，赶一盏急灯，我出三倍工钱，天亮前我拿走。",
            "labels": {"social_act": "求助", "trust_shift": "不确定", "fear_shift": "上升",
                       "deception": "信息不足", "boundary_violation": "已越过"},
            "basis": {
                "social_act": "求人三更破例赶工，请求地位；§1 求助。",
                "trust_shift": "三倍工钱是当场出价，无可核验的兑现；R-8.5 不确定。",
                "fear_shift": "三更叩门加急活，祝师傅可见的意外直指铺门；§3 上升。",
                "deception": "「明日一早要用」无从当场核验；R-8.1 信息不足。",
                "boundary_violation": "当面求三更后赶工，恰触「三更一过就熄灯」；R-8.4 已越过。",
            },
            "decisive_evidence": {
                "social_act": ["赶一盏急灯", "我出三倍工钱"],
                "trust_shift": ["我出三倍工钱", "天亮前我拿走"],
                "fear_shift": ["三更的梆子刚敲过", "铺门被叩响"],
                "deception": ["有一盏灯明日一早要用"],
                "boundary_violation": ["赶工不过三更，三更一过就熄灯", "赶一盏急灯"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "判据可见：三更梆子刚过（R-8.3 判据满足→才谈已越过）。",
        },
    ]


def M04_items():
    return [
        # --- C400-D010 short: threat shell around a crossing request ----------
        {
            "sid": "E1-C400-010", "family": "M04", "rel": "coffin_stranger",
            "persona": P_M04, "boundary": B_M04,
            "history": [
                "钱二叔的铺子给县里老仓官做过寿木，手艺有口碑。",
                "前日铺里刚出过一口合葬的材，工钱还没结完。",
            ],
            "extra_history": [
                "今早玩家进铺，说家里老人病重，要预定一口阳寿材。",
                "钱二叔摆手说不与活人量材。",
                "玩家把一包点心放在案上，话里带着硬气。",
            ],
            "turn": "二叔，给我爹量一口，价钱您开；您要不接，我让我舅爷来跟您叙叙——他在县衙当班。",
            "labels": {"social_act": "威胁", "trust_shift": "不变", "fear_shift": "上升",
                       "deception": "信息不足", "boundary_violation": "已越过"},
            "basis": {
                "social_act": "点心外壳+借官差施压的内容，按内容归类；§1 威胁/§0.2。",
                "trust_shift": "本次无守约违约可比；R-8.5 不变。",
                "fear_shift": "搬出县衙当班的舅爷施压，钱二叔可见的处境压力；§3 上升。",
                "deception": "「家父病重」无从当场核验；R-8.1 信息不足。",
                "boundary_violation": "当面要求给活人量寿材，被要求即为触线；R-8.4 已越过。",
            },
            "decisive_evidence": {
                "social_act": ["我让我舅爷来跟您叙叙", "他在县衙当班"],
                "trust_shift": ["价钱您开"],
                "fear_shift": ["他在县衙当班", "话里带着硬气"],
                "deception": ["家里老人病重"],
                "boundary_violation": ["不与活人量寿材", "给我爹量一口"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "礼貌威胁对照（§0.4/§1）：外壳不降级，内容定类。",
        },
        # --- C400-D011 short: tool-lending request crosses --------------------
        {
            "sid": "E1-C400-011", "family": "M04", "rel": "coffin_regular",
            "persona": P_M04, "boundary": B_M04,
            "history": [
                "玩家的老屋上个月翻修过门槛，请钱二叔看过木料。",
                "钱二叔的墨斗尺用了三十年，尺身刻着他师父的名字。",
            ],
            "extra_history": [
                "今早玩家来铺里闲坐，看中了案上那把墨斗尺。",
                "钱二叔把尺往怀里收了收。",
            ],
            "turn": "二叔，把您那把尺借我用半天，我家打张桌子，晚晌就还您。",
            "labels": {"social_act": "求助", "trust_shift": "不确定", "fear_shift": "不变",
                       "deception": "信息不足", "boundary_violation": "已越过"},
            "basis": {
                "social_act": "求借铺里的尺，请求地位；§1 求助。",
                "trust_shift": "「晚晌就还」是未到期的口头许诺；R-8.5 不确定。",
                "fear_shift": "闲坐借尺无危险线索；§3 不变。",
                "deception": "「打张桌子」无从当场核验；R-8.1 信息不足。",
                "boundary_violation": "当面求借墨斗尺，恰触「不外借」；R-8.4 已越过。",
            },
            "decisive_evidence": {
                "social_act": ["借我用半天"],
                "trust_shift": ["晚晌就还您"],
                "fear_shift": ["把尺往怀里收了收"],
                "deception": ["我家打张桌子"],
                "boundary_violation": ["铺里的墨斗尺不外借", "把您那把尺借我用半天"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "求借即触线（R-8.4）。",
        },
        # --- C400-D012 short: ordinary purchase, matching payment -------------
        {
            "sid": "E1-C400-012", "family": "M04", "rel": "coffin_regular",
            "persona": P_M04, "boundary": B_M04,
            "history": [
                "玩家的老仆上月底过身，后事定在初七。",
                "前日玩家与钱二叔议定一口杉木中材，讲定今日付定钱五十文。",
            ],
            "extra_history": [
                "今早玩家到铺，付定钱五十文。",
                "钱二叔开了收票，写明初七交材。",
            ],
            "turn": "二叔，定钱五十文你点点，初七我来迎材，娘的交代不能误。",
            "labels": {"social_act": "合作", "trust_shift": "不变", "fear_shift": "不变",
                       "deception": "无线索", "boundary_violation": "未越过"},
            "basis": {
                "social_act": "订材付定，双向对价；§1 合作。",
                "trust_shift": "付定是本次交易对价，交材之约未到兑现时点，无当前履约或违约可比；R-8.5 不变。",
                "fear_shift": "办后事往来无危险线索；§3 不变。",
                "deception": "定钱与讲定数目相符，钱二叔当面点过；§4 无线索/R-8.2。",
                "boundary_violation": "为已故之人订材不在「不与活人量材」之列；§5 未越过。",
            },
            "decisive_evidence": {
                "social_act": ["定钱五十文你点点"],
                "trust_shift": ["讲定今日付定钱五十文", "付定钱五十文"],
                "fear_shift": ["开了收票"],
                "deception": ["讲定今日付定钱五十文", "付定钱五十文"],
                "boundary_violation": ["不与活人量寿材", "老仆上月底过身"],
            },
            "tags": [PLAN_ID], "len": "short",
            "notes": "定金是本次对价而非履约主张（对照中控 013 号修正：当前点数不证明结算，故不记上升）。",
        },
    ]
