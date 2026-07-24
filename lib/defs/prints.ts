import { CardPrint, Ruleset, SideDeck, UserRulesetData } from '../engine/Card';
import { MoxType } from '../engine/constants';
import { sigilInfos } from './sigils';

const RULESETS = {
    imfComp: {
        name: 'IMF Competitive',
        prints: {
            starvation: {
                name: 'Starvation',
                banned: true,
                power: 1,
                health: 1,
                // starvationStrike：打出时 attack>=9 造成额外优势。
                // voidDamage（Repulsive）+ airborne（Mighty Leap）在 turnsStarving>=5 时动态添加。
                sigils: ['starvationStrike'],
            },
            greaterSmoke: {
                name: 'Greater Smoke',
                rare: true,
                banned: true,
                power: 1,
                health: 3,
                sigils: ['fourBones'],
            },
            adder: {
                name: 'Adder',
                power: 2,
                health: 2,
                cost: { type: 'blood', amount: 2 },
                sigils: ['deathTouch'],
            },
            bat: {
                name: 'Bat',
                power: 2,
                health: 1,
                cost: { type: 'bone', amount: 4 },
                sigils: ['airborne'],
            },
            beaver: {
                name: 'Beaver',
                power: 1,
                health: 3,
                cost: { type: 'blood', amount: 2 },
                sigils: ['damBuilder'],
            },
            dam: {
                name: 'Dam',
                banned: true,
                power: 0,
                health: 2,
                noSac: true,
                sigils: ['mightyLeap'],
            },
            bee: {
                name: 'Bee',
                banned: true,
                power: 1,
                health: 1,
                sigils: ['airborne'],
            },
            beehive: {
                name: 'Beehive',
                power: 0,
                health: 2,
                cost: { type: 'blood', amount: 1 },
                sigils: ['beesWithin'],
            },
            blackGoat: {
                name: 'Black Goat',
                power: 0,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['threeSacs'],
            },
            bloodhound: {
                name: 'Bloodhound',
                power: 2,
                health: 3,
                cost: { type: 'blood', amount: 2 },
                sigils: ['chaseOpposingPlay'],
            },
            bullfrog: {
                name: 'Bullfrog',
                power: 1,
                health: 3,
                cost: { type: 'blood', amount: 1 },
                sigils: ['mightyLeap'],
            },
            cat: {
                name: 'Cat',
                desc: 'Note: This card was changed to rare due to the amount of advantage given by this card.',
                rare: true,
                scrybe: 'nature',
                power: 0,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['manyLives'],
            },
            catUndead: {
                name: 'Undead Cat',
                banned: true,
                power: 3,
                health: 6,
                cost: { type: 'blood', amount: 1 },
            },
            cockroach: {
                name: 'Cockroach',
                power: 1,
                health: 1,
                cost: { type: 'bone', amount: 4 },
                sigils: ['unkillable'],
            },
            corpseMaggots: {
                name: 'Corpse Maggots',
                power: 1,
                health: 2,
                cost: { type: 'bone', amount: 4 },
                sigils: ['corpseEater'],
            },
            theDaus: {
                name: 'The Daus',
                rare: true,
                scrybe: 'nature',
                power: 2,
                health: 2,
                cost: { type: 'blood', amount: 2 },
                sigils: ['bellist'],
            },
            chime: {
                name: 'Chime',
                banned: true,
                tribes: ['bell'],
                power: 0,
                health: 1,
                noSac: true,
                sigils: ['mightyLeap'],
            },
            direWolfPup: {
                name: 'Dire Wolf Pup',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 2 },
                sigils: ['boneDigger', 'evolve'],
                evolution: 'direWolf',
            },
            direWolf: {
                name: 'Dire Wolf',
                power: 2,
                health: 5,
                cost: { type: 'blood', amount: 3 },
                sigils: ['doubleAttack'],
            },
            elk: {
                name: 'Elk',
                power: 2,
                health: 4,
                cost: { type: 'blood', amount: 2 },
                sigils: ['strafe'],
            },
            elkCub: {
                name: 'Elk Fawn',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['strafe', 'evolve'],
                evolution: 'elk',
            },
            fieldMice: {
                name: 'Field Mice',
                banned: true,
                power: 2,
                health: 2,
                cost: { type: 'blood', amount: 2 },
                sigils: ['drawCopy'],
            },
            fieldMiceFused: {
                name: 'Spore Mice',
                banned: true,
                fused: true,
                power: 2,
                health: 2,
                cost: { type: 'blood', amount: 2 },
                sigils: ['drawCopy', 'drawCopy'],
            },
            hawk: {
                name: 'Hawk',
                power: 3,
                health: 1,
                cost: { type: 'blood', amount: 2 },
                sigils: ['airborne'],
            },
            hrokkall: {
                name: 'Hrokkall',
                rare: true,
                scrybe: 'nature',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['waterborne', 'gainBattery'],
            },
            ratKing: {
                name: 'Rat King',
                power: 2,
                health: 1,
                cost: { type: 'blood', amount: 2 },
                sigils: ['fourBones'],
            },
            ravenEgg: {
                name: 'Raven Egg',
                power: 0,
                health: 2,
                cost: { type: 'blood', amount: 1 },
                sigils: ['evolve'],
                evolution: 'raven',
            },
            kingfisher: {
                name: 'Kingfisher',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['airborne', 'waterborne'],
            },
            kraken: {
                name: 'Great Kraken',
                desc: 'Note: This card\'s effect was changed due to it sucking.',
                rare: true,
                scrybe: 'nature',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['waterborneTentacle'],
            },
            alpha: {
                name: 'Alpha',
                power: 1,
                health: 2,
                cost: { type: 'bone', amount: 4 },
                sigils: ['leader'],
            },
            magpie: {
                name: 'Magpie',
                desc: 'This card was unused in act 2, but had art.',
                rare: true,
                scrybe: 'nature',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 2 },
                sigils: ['airborne', 'hoarder'],
            },
            mantis: {
                name: 'Mantis',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['bistrike'],
            },
            mantisGod: {
                name: 'Mantis God',
                rare: true,
                scrybe: 'nature',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['tristrike'],
            },
            mole: {
                name: 'Mole',
                power: 0,
                health: 4,
                cost: { type: 'blood', amount: 1 },
                sigils: ['chaseAttack'],
            },
            moleMan: {
                name: 'Mole Man',
                rare: true,
                scrybe: 'nature',
                power: 0,
                health: 6,
                cost: { type: 'blood', amount: 1 },
                sigils: ['chaseAttack', 'mightyLeap'],
            },
            mooseBuck: {
                name: 'Moose Buck',
                power: 3,
                health: 7,
                cost: { type: 'blood', amount: 3 },
                sigils: ['strafePush'],
            },
            opossum: {
                name: 'Opossum',
                power: 1,
                health: 1,
                cost: { type: 'bone', amount: 2 },
            },
            ouroboros: {
                name: 'Ouroboros',
                desc: 'This card gains 1 power and 1 health each time it perishes.',
                rare: true,
                scrybe: 'nature',
                power: 1,
                health: 1,
                cost: { type: 'blood', amount: 2 },
                sigils: ['unkillable'],
            },
            rabbit: {
                name: 'Rabbit',
                power: 0,
                health: 1,
            },
            skunk: {
                name: 'Skunk',
                power: 0,
                health: 3,
                cost: { type: 'blood', amount: 1 },
                sigils: ['stinky'],
            },
            coyote: {
                name: 'Coyote',
                power: 2,
                health: 1,
                cost: { type: 'bone', amount: 4 },
            },
            greatWhite: {
                name: 'Great White',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                power: 4,
                health: 2,
                cost: { type: 'blood', amount: 3 },
                sigils: ['waterborne'],
            },
            grizzly: {
                name: 'Grizzly',
                power: 4,
                health: 5,
                cost: { type: 'blood', amount: 3 },
            },
            porcupine: {
                name: 'Porcupine',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                power: 1,
                health: 2,
                cost: { type: 'blood', amount: 1 },
                sigils: ['sharp'],
            },
            pronghorn: {
                name: 'Pronghorn',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                power: 1,
                health: 3,
                cost: { type: 'blood', amount: 2 },
                sigils: ['bistrike', 'strafe'],
            },
            rattler: {
                name: 'Rattler',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                power: 3,
                health: 1,
                cost: { type: 'bone', amount: 6 },
            },
            raven: {
                name: 'Raven',
                power: 2,
                health: 3,
                cost: { type: 'blood', amount: 2 },
                sigils: ['airborne'],
            },
            salmon: {
                name: 'Salmon',
                power: 2,
                health: 2,
                cost: { type: 'blood', amount: 2 },
                sigils: ['waterborne', 'strafe'],
            },
            riverSnapper: {
                name: 'River Snapper',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                power: 1,
                health: 6,
                cost: { type: 'blood', amount: 2 },
            },
            sparrow: {
                name: 'Sparrow',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                power: 1,
                health: 2,
                cost: { type: 'blood', amount: 1 },
                sigils: ['airborne'],
            },
            strangeLarva: {
                name: 'Strange Larva',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                rare: true,
                scrybe: 'nature',
                power: 0,
                health: 3,
                cost: { type: 'blood', amount: 1 },
                sigils: ['evolve'],
                evolution: 'strangePupa',
            },
            strangePupa: {
                name: 'Strange Pupa',
                rare: true,
                scrybe: 'nature',
                banned: true,
                power: 0,
                health: 3,
                cost: { type: 'blood', amount: 1 },
                sigils: ['evolve'],
                evolution: 'mothman',
            },
            mothman: {
                name: 'Mothman',
                rare: true,
                scrybe: 'nature',
                banned: true,
                power: 7,
                health: 3,
                cost: { type: 'blood', amount: 1 },
                sigils: ['airborne'],
            },
            turkeyVulture: {
                name: 'Turkey Vulture',
                desc: 'Ported from Act 1. Act 2 sprite by syntaxevasion.',
                power: 3,
                health: 3,
                cost: { type: 'bone', amount: 8 },
                sigils: ['airborne'],
            },
            bellTentacle: {
                name: 'Bell Tentacle',
                banned: true,
                tribes: ['tentacle'],
                power: 'bells',
                health: 3,
                cost: { type: 'blood', amount: 2 },
                sigils: ['waterborneTentacle'],
            },
            handTentacle: {
                name: 'Hand Tentacle',
                banned: true,
                tribes: ['tentacle'],
                power: 'hand',
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['waterborneTentacle'],
            },
            mirrorTentacle: {
                name: 'Mirror Tentacle',
                banned: true,
                tribes: ['tentacle'],
                power: 'mirror',
                health: 3,
                cost: { type: 'blood', amount: 1 },
                sigils: ['waterborneTentacle'],
            },
            squirrel: {
                name: 'Squirrel',
                power: 0,
                health: 1,
            },
            squirrelBall: {
                name: 'Squirrel Ball',
                power: 0,
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['squirrelStrafe'],
            },
            stoat: {
                name: 'Stoat',
                desc: 'Note: Health was increased to 3 to make it better than Bullfrog in at least one way. Bears a unique ability from Act 1.',
                power: 1,
                health: 3,
                cost: { type: 'blood', amount: 1 },
            },
            urayuli: {
                name: 'Urayuli',
                rare: true,
                scrybe: 'nature',
                power: 7,
                health: 7,
                cost: { type: 'blood', amount: 4 },
            },
            warren: {
                name: 'Warren',
                power: 0,
                health: 2,
                cost: { type: 'blood', amount: 1 },
                sigils: ['drawRabbit'],
            },
            wolf: {
                name: 'Wolf',
                power: 3,
                health: 2,
                cost: { type: 'blood', amount: 2 },
            },
            wolfCub: {
                name: 'Wolf Cub',
                power: 1,
                health: 2,
                cost: { type: 'blood', amount: 1 },
                sigils: ['evolve'],
                evolution: 'wolf',
            },
            workerAnt: {
                name: 'Worker Ant',
                tribes: ['ant'],
                power: 'ants',
                health: 2,
                cost: { type: 'blood', amount: 1 },
            },
            queenAnt: {
                name: 'Ant Queen',
                tribes: ['ant'],
                power: 'ants',
                health: 3,
                cost: { type: 'blood', amount: 2 },
                sigils: ['antSpawner'],
            },
            flyingAnt: {
                name: 'Flying Ant',
                tribes: ['ant'],
                power: 'ants',
                health: 1,
                cost: { type: 'blood', amount: 1 },
                sigils: ['airborne'],
            },
            curveHopper: {
                name: 'Curve Hopper',
                rare: true,
                scrybe: 'tech',
                power: 2,
                health: 3,
                cost: { type: 'energy', amount: 4 },
            },
            automaton: {
                name: 'Automaton',
                desc: 'Note: The energy cost of this card was reduced to make it less terrible.',
                power: 1,
                health: 1,
                cost: { type: 'energy', amount: 2 },
            },
            energyBot: {
                name: 'Energy Bot',
                power: 0,
                health: 1,
                cost: { type: 'energy', amount: 2 },
                sigils: ['gainBattery'],
            },
            bolthound: {
                name: 'Bolthound',
                desc: 'Note: Health was increased to 3 to make it equivalent to other "Hound" cards.',
                power: 2,
                health: 3,
                cost: { type: 'energy', amount: 6 },
                sigils: ['chaseOpposingPlay'],
            },
            doubleGunner: {
                name: 'Double Gunner',
                power: 2,
                health: 1,
                cost: { type: 'energy', amount: 6 },
                sigils: ['bistrike'],
            },
            explodeBot: {
                name: 'Explode Bot',
                face: 'common',
                power: 1,
                health: 1,
                cost: { type: 'energy', amount: 2 },
                noSac: true,
                sigils: ['detonator'],
            },
            gamblobot: {
                name: 'Gamblobot',
                desc: 'Note: The cost of this ability was increased to 2 energy due to this card being very strong for its cost.',
                power: 0,
                health: 1,
                cost: { type: 'energy', amount: 3 },
                sigils: ['activatedDiceRollEnergy'],
            },
            insectodrone: {
                name: 'Insectodrone',
                power: 1,
                health: 2,
                cost: { type: 'energy', amount: 3 },
                sigils: ['airborne'],
            },
            leapingBot: {
                name: 'L33pB0t',
                power: 1,
                health: 2,
                cost: { type: 'energy', amount: 3 },
                sigils: ['mightyLeap'],
            },
            minecart: {
                name: '49er',
                power: 1,
                health: 1,
                cost: { type: 'energy', amount: 2 },
                sigils: ['strafe'],
            },
            plasmaJimmy: {
                name: 'Plasma Jimmy',
                rare: true,
                scrybe: 'tech',
                power: 0,
                health: 3,
                cost: { type: 'energy', amount: 2 },
                sigils: ['activatedDealDamage'],
            },
            steelMice: {
                name: 'Steel Mice',
                power: 1,
                health: 1,
                cost: { type: 'energy', amount: 4 },
                sigils: ['drawCopy'],
            },
            sentryBot: {
                name: 'Sentry Drone',
                desc: 'Note: The sentry sigil now triggers when this card is pushed by another card.',
                power: 0,
                health: 1,
                cost: { type: 'energy', amount: 1 },
                sigils: ['sentry'],
            },
            sentryBotFused: {
                name: 'Sentry Spore',
                banned: true,
                fused: true,
                power: 0,
                health: 1,
                cost: { type: 'energy', amount: 1 },
                sigils: ['sentry', 'sentry'],
            },
            bombMaiden: {
                name: 'Mrs. Bomb',
                rare: true,
                scrybe: 'tech',
                power: 1,
                health: 2,
                cost: { type: 'energy', amount: 3 },
                sigils: ['bombSpewer'],
            },
            shutterbug: {
                name: 'Shutterbug',
                desc: 'Note: The sentry sigil now triggers when this card is pushed by another card.',
                rare: true,
                scrybe: 'tech',
                power: 1,
                health: 1,
                cost: { type: 'energy', amount: 5 },
                sigils: ['deathTouch', 'sentry'],
            },
            sniperBot: {
                name: 'Sniper Bot',
                // banned: true,
                power: 1,
                health: 1,
                cost: { type: 'energy', amount: 3 },
                sigils: ['sniper'],
            },
            steambot: {
                name: 'Steambot',
                desc: 'Note: This card\'s attack was increased to make it worth 6 energy.',
                power: 3,
                health: 2,
                cost: { type: 'energy', amount: 6 },
            },
            gemModule: {
                name: 'Mox Module',
                rare: true,
                scrybe: 'tech',
                power: 0,
                health: 3,
                cost: { type: 'energy', amount: 3 },
                sigils: ['gainGemAll'],
                tribes: ['mox'],
            },
            thickBot: {
                name: 'Thick Droid',
                power: 1,
                health: 3,
                cost: { type: 'energy', amount: 5 },
            },
            draugr: {
                name: 'Draugr',
                face: 'terrain',
                power: 0,
                health: 1,
                cost: { type: 'bone', amount: 1 },
                noSac: true,
                sigils: ['frozen'],
                evolution: 'skeleton',
            },
            banshee: {
                name: 'Banshee',
                power: 1,
                health: 3,
                cost: { type: 'bone', amount: 3 },
                sigils: ['airborne'],
            },
            bonehound: {
                name: 'Bonehound',
                power: 2,
                health: 3,
                cost: { type: 'bone', amount: 7 },
                sigils: ['chaseOpposingPlay'],
            },
            bonelordHorn: {
                name: 'Bone Lord\'s Horn',
                desc: 'Note: This card gives only 1 bone per 1 energy due to the previous effect being overpowered in combination with Bone Heap.',
                rare: true,
                scrybe: 'undead',
                power: 1,
                health: 1,
                cost: { type: 'bone', amount: 3 },
                sigils: [
                    'activatedEnergyToBones',
                ],
            },
            boneHeap: {
                name: 'Bone Heap',
                rare: true,
                scrybe: 'undead',
                power: 0,
                health: 1,
                sigils: ['activatedStatsUp'],
            },
            drownedSoul: {
                name: 'Drowned Soul',
                rare: true,
                scrybe: 'undead',
                power: 1,
                health: 1,
                cost: { type: 'bone', amount: 4 },
                sigils: ['waterborne', 'deathTouch'],
            },
            walkers: {
                name: 'The Walkers',
                power: 2,
                health: 2,
                cost: { type: 'bone', amount: 5 },
                sigils: ['fourBones'],
            },
            franknstein: {
                name: 'Frank & Stein',
                power: 2,
                health: 2,
                cost: { type: 'bone', amount: 5 },
                conduit: true,
            },
            pharoahsPets: {
                name: 'Pharoah\'s Pets',
                power: 0,
                health: 1,
                cost: { type: 'bone', amount: 6 },
                sigils: ['threeSacs', 'manyLives'],
            },
            ghostShip: {
                name: 'Ghost Ship',
                power: 0,
                health: 1,
                cost: { type: 'bone', amount: 2 },
                sigils: ['waterborne', 'skeletonStrafe'],
            },
            gravedigger: {
                name: 'Gravedigger',
                power: 0,
                health: 3,
                cost: { type: 'bone', amount: 1 },
                sigils: ['boneDigger'],
            },
            gravediggerFused: {
                name: 'Sporedigger',
                banned: true,
                fused: true,
                power: 0,
                health: 3,
                cost: { type: 'bone', amount: 1 },
                sigils: ['boneDigger', 'boneDigger'],
            },
            headlessHorseman: {
                name: 'Headless Horseman',
                rare: true,
                scrybe: 'undead',
                power: 5,
                health: 5,
                cost: { type: 'bone', amount: 13 },
                sigils: ['airborne', 'strafe'],
            },
            mummy: {
                name: 'Mummy Lord',
                power: 3,
                health: 3,
                cost: { type: 'bone', amount: 8 },
            },
            necromancer: {
                name: 'Necromancer',
                rare: true,
                scrybe: 'undead',
                power: 1,
                health: 2,
                cost: { type: 'bone', amount: 3 },
                sigils: ['doubleDeath'],
            },
            revenant: {
                name: 'Revenant',
                power: 3,
                health: 1,
                cost: { type: 'bone', amount: 3 },
                sigils: ['brittle'],
            },
            sarcophagus: {
                name: 'Sarcophagus',
                power: 0,
                health: 2,
                cost: { type: 'bone', amount: 4 },
                sigils: ['evolve'],
                evolution: 'mummy',
            },
            skeleton: {
                name: 'Skeleton',
                banned: true,
                power: 1,
                health: 1,
                sigils: ['brittle'],
            },
            skeletonMage: {
                name: 'Skelemagus',
                desc: 'Note: Was given energy cost due to being too spammable and easy to draw into with Blue Mage.',
                power: 4,
                health: 1,
                cost: { type: 'energy', amount: 4 },
                sigils: ['brittle', 'gemDependant'],
            },
            tombRobber: {
                name: 'Tomb Robber',
                desc: 'Note: Withered corpses have the Boneless sigil and will not drop bones.This change was made to prevent multiple infinite combos involving Tomb Robber.',
                rare: true,
                scrybe: 'undead',
                power: 0,
                health: 2,
                sigils: ['activatedDrawSkeleton'],
            },
            zombie: {
                name: 'Zombie',
                desc: 'This card was given the stinky sigil to differentiate it from Opossom. Suggested by FishGuy101.',
                power: 1,
                health: 1,
                cost: { type: 'bone', amount: 3 },
                sigils: ['stinky'],
            },
            gourmage: {
                name: 'Gourmage',
                power: 0,
                health: 2,
                cost: { type: 'mox', needs: MoxType.Green },
                sigils: ['activatedStatsUp'],
            },
            blueMage: {
                name: 'Blue Mage',
                rare: true,
                scrybe: 'wizard',
                power: 0,
                health: 1,
                cost: { type: 'mox', needs: MoxType.Blue },
                sigils: ['gemsDraw'],
            },
            blueMageFused: {
                name: 'Blue Sporemage',
                banned: true,
                fused: true,
                power: 0,
                health: 1,
                cost: { type: 'mox', needs: MoxType.Blue },
                sigils: ['gemsDraw', 'gemsDraw'],
            },
            hoverMage: {
                name: 'Hover Mage',
                power: 1,
                health: 2,
                cost: { type: 'mox', needs: MoxType.Blue },
                sigils: ['airborne'],
            },
            forceMage: {
                name: 'Force Mage',
                desc: 'Dies to removal.',
                power: 0,
                health: 1,
                cost: { type: 'mox', needs: MoxType.Blue },
                sigils: ['voidDamage'],
            },
            gemFiend: {
                name: 'Gem Fiend',
                power: 2,
                health: 1,
                cost: { type: 'mox', needs: MoxType.Blue },
                sigils: ['gemDependant'],
            },
            greenMage: {
                name: 'Green Mage',
                desc: 'This card\'s attack is equal to the number of "Mox" cards you possess.',
                power: 'moxes',
                health: 2,
                cost: { type: 'mox', needs: MoxType.Green },
            },
            juniorSage: {
                name: 'Junior Sage',
                power: 1,
                health: 3,
                cost: { type: 'mox', needs: MoxType.Green },
            },
            mageKnight: {
                name: 'Mage Knight',
                power: 1,
                health: 3,
                cost: { type: 'mox', needs: MoxType.Orange },
                sigils: ['gemDependant'],
            },
            masterBG: {
                name: 'Master Bleene',
                rare: true,
                scrybe: 'wizard',
                power: 0,
                health: 4,
                cost: { type: 'mox', needs: MoxType.Green | MoxType.Blue },
                sigils: ['activatedSacrificeDraw'],
            },
            masterGO: {
                name: 'Master Goranj',
                desc: 'He got buffed a while back. Thanks FishGuy101!',
                rare: true,
                scrybe: 'wizard',
                power: 2,
                health: 4,
                cost: { type: 'mox', needs: MoxType.Green | MoxType.Orange },
                sigils: ['gemDependant', 'bistrike'],
            },
            masterOB: {
                name: 'Master Orlu',
                desc: 'Note: Attack was increased to make it an acceptable rare card and to demonstrate its sigil effect more clearly.',
                rare: true,
                scrybe: 'wizard',
                power: 1,
                health: 3,
                cost: { type: 'mox', needs: MoxType.Orange | MoxType.Blue },
                sigils: ['airborne', 'looter'],
            },
            moxBG: {
                name: 'Bleene\'s Mox',
                rare: true,
                scrybe: 'wizard',
                power: 0,
                health: 2,
                noSac: true,
                sigils: ['gainGemBlue', 'gainGemGreen'],
                tribes: ['mox'],
            },
            moxGO: {
                name: 'Goranj\'s Mox',
                rare: true,
                scrybe: 'wizard',
                power: 0,
                health: 2,
                noSac: true,
                sigils: ['gainGemGreen', 'gainGemOrange'],
                tribes: ['mox'],
            },
            moxOB: {
                name: 'Orlu\'s Mox',
                rare: true,
                scrybe: 'wizard',
                power: 0,
                health: 2,
                noSac: true,
                sigils: ['gainGemOrange', 'gainGemBlue'],
                tribes: ['mox'],
            },
            moxG: {
                name: 'Emerald Mox',
                face: 'terrain',
                banned: true,
                power: 0,
                health: 1,
                noSac: true,
                sigils: ['gainGemGreen'],
                tribes: ['mox'],
            },
            moxO: {
                name: 'Ruby Mox',
                face: 'terrain',
                banned: true,
                power: 0,
                health: 1,
                noSac: true,
                sigils: ['gainGemOrange'],
                tribes: ['mox'],
            },
            moxB: {
                name: 'Sapphire Mox',
                face: 'terrain',
                banned: true,
                power: 0,
                health: 1,
                noSac: true,
                sigils: ['gainGemBlue'],
                tribes: ['mox'],
            },
            moxAll: {
                name: 'Magnus Mox',
                rare: true,
                scrybe: 'wizard',
                banned: true,
                power: 0,
                health: 2,
                noSac: true,
                sigils: ['gainGemAll'],
                tribes: ['mox'],
            },
            muscleMage: {
                name: 'Muscle Mage',
                power: 1,
                health: 2,
                cost: { type: 'mox', needs: MoxType.Green },
                sigils: ['strafePush'],
            },
            orangeMage: {
                name: 'Orange Mage',
                power: 0,
                health: 1,
                cost: { type: 'mox', needs: MoxType.Orange },
                sigils: ['buffGems'],
            },
            practiceMage: {
                name: 'Practice Wizard',
                power: 0,
                health: 3,
                cost: { type: 'mox', needs: MoxType.Orange },
                sigils: ['stone'],
            },
            magePupil: {
                name: 'Mage Pupil',
                power: 1,
                health: 1,
                sigils: ['gemDependant'],
            },
            rubyGolem: {
                name: 'Ruby Golem',
                face: 'terrain',
                power: 1,
                health: 1,
                cost: { type: 'mox', needs: MoxType.Orange },
                noSac: true,
                sigils: ['dropRubyOnDeath'],
            },
            stimMage: {
                name: 'Stim Mage',
                power: 0,
                health: 2,
                cost: { type: 'mox', needs: MoxType.Green },
                sigils: ['activatedStatsUpEnergy'],
            },
            witheredCorpse: {
                name: 'Withered Corpse',
                banned: true,
                power: 1,
                health: 1,
                sigils: ['brittle', 'boneless'],
            },
            emptyVessel: {
                name: 'Empty Vessel',
                banned: true,
                power: 0,
                health: 3,
                cost: { type: 'energy', amount: 1 },
                noSac: true,
            },
            // Vessel 变体（对齐 Godot standard.json side_decks.Vessels 的 single_cat 分类）
            // 注意：portrait 未显式指定——无独立精灵表索引，Sprite 组件会降级为占位符。
            // 如需正式美术，需在 lib/spritesheets/portraits.ts 补坐标或在 PNG 中加图素。
            leapingVessel: {
                name: 'Leaping Vessel',
                banned: true,
                power: 0,
                health: 3,
                cost: { type: 'energy', amount: 1 },
                noSac: true,
                sigils: ['airborne'],
            },
            bloodyVessel: {
                name: 'Bloody Vessel',
                banned: true,
                power: 0,
                health: 3,
                cost: { type: 'energy', amount: 1 },
                noSac: true,
                sigils: ['threeSacs'],
            },
            sharpVessel: {
                name: 'Sharp Vessel',
                banned: true,
                power: 0,
                health: 3,
                cost: { type: 'energy', amount: 1 },
                noSac: true,
                sigils: ['sharp'],
            },

            nullConduit: {
                name: 'Null Conduit',
                power: 0,
                health: 1,
                cost: { type: 'energy', amount: 1 },
                conduit: true,
            },
            conduitEnergy: {
                name: 'Energy Conduit',
                desc: 'Note: Effect was changed to prevent infinitely buffing stim mage.',
                rare: true,
                power: 1,
                health: 2,
                cost: { type: 'energy', amount: 3 },
                conduit: true,
                sigils: ['conduitGainEnergy'],
            },
            conduitPower: {
                name: 'Buff Conduit',
                power: 0,
                health: 2,
                cost: { type: 'energy', amount: 2 },
                conduit: true,
                sigils: ['conduitGainPower'],
            },
            conduitFactory: {
                name: 'Factory Conduit',
                power: 0,
                health: 2,
                cost: { type: 'energy', amount: 3 },
                conduit: true,
                sigils: ['conduitSpawner'],
            },

            // Thick 测试卡（对齐 Godot standard.json 的 Thick Droid）
            // 注意：portrait 未显式指定——无独立精灵表索引，Sprite 组件会降级为占位符。
            // 如需正式美术，需在 lib/spritesheets/portraits.ts 补坐标或在 PNG 中加图素。
            thickDroid: {
                name: 'Thick Droid',
                power: 1,
                health: 3,
                cost: { type: 'energy', amount: 5 },
                sigils: ['thick'],
                leftHalf: 'thick',
                rightHalf: 'droid',
            },
            thick: {
                name: 'Thick',
                banned: true,
                power: 1,
                health: 3,
            },
            droid: {
                name: 'Droid',
                banned: true,
                power: 1,
                health: 3,
            },

        },
        sideDecks: {
            squirrels: {
                name: 'Squirrels',
                repeat: [10, 'squirrel'],
            },
            skeletons: {
                name: 'Skeletons',
                repeat: [10, 'skeleton'],
            },
            // single_cat 格式示例（对齐 Godot standard.json side_decks.Vessels）
            vessels: {
                name: 'Vessels',
                singleCat: {
                    '10 Empty': [10, 'emptyVessel'],
                    '10 Leaping': [10, 'leapingVessel'],
                    '10 Bloody': [10, 'bloodyVessel'],
                    '10 Sharp': [10, 'sharpVessel'],
                },
            },
            moxG: {
                name: 'Emerald Mox',
                repeat: [10, 'moxG'],
            },
            moxB: {
                name: 'Sapphire Mox',
                repeat: [10, 'moxB'],
            },
            moxO: {
                name: 'Ruby Mox',
                repeat: [10, 'moxO'],
            },
            // draft 格式示例（对齐 Godot standard.json side_decks["Mox (draft)"]）
            moxDraft: {
                name: 'Mox (Draft)',
                draft: { cards: ['moxG', 'moxB', 'moxO'], count: 10 },
            },
        },
        sigilParams: {
            antSpawner: ['workerAnt'],
            beesWithin: ['bee'],
            bellist: ['chime'],
            bombSpewer: ['explodeBot'],
            boneDigger: [1],
            damBuilder: ['dam'],
            detonator: [5],
            skeletonStrafe: ['skeleton'],
            squirrelStrafe: ['squirrel'],
            activatedDealDamage: [1, 1],
            // Phase 2 主动技能变体（对齐 Godot CardInfo.gd 描述）：
            // - Power Dice (2)：2 能量掷骰（gamblobot desc 明确说"cost increased to 2 energy"）
            // - Stimulate (4)：4 能量换 +1/+1
            // - Enlarge (3)：3 骨头换 +1/+1（已正确）
            // - Bonehorn (1)：1 能量换 1 骨头（已正确）
            // - Disentomb (Corpses)：2 骨头换 witheredCorpse（已正确）
            activatedDiceRollEnergy: [2],
            activatedDrawSkeleton: [2, 'witheredCorpse'],
            activatedEnergyToBones: [1, 1],
            activatedSacrificeDraw: [3],
            activatedStatsUpEnergy: [4, 1],
            activatedStatsUp: [3, 1],
            activatedHealBones: [2, 2],
            conduitGainEnergy: [3],
            conduitSpawner: ['leapingBot'],
        },
    },
} satisfies Record<string, Ruleset<true>>;

export const rulesets: Record<string, Ruleset> = RULESETS;

/**
 * Phase 3.4：运行时注册用户自定义 ruleset。
 *
 * 用户 ruleset 在游戏开始时通过 getMergedRuleset 合并后，注册到此 map 中，
 * 使引擎的 `rulesets[opts.ruleset]` 查找能正常工作。
 *
 * synthetic key 格式：`user:${rulesetId}`（rulesetId 是 DB 的 UUID）。
 * 注册是幂等的（重复注册同一 key 会覆盖）。
 *
 * 注意：服务器重启后注册会丢失。游戏恢复时需在 game.ts 的 getHost 后重新注册。
 */
export function registerRuleset(key: string, ruleset: Ruleset): void {
    rulesets[key] = ruleset;
}

/** 判断 rulesetId 是否为已注册的 ruleset（内置或用户注册的）。 */
export function isRegisteredRuleset(id: string): boolean {
    return id in rulesets;
}

/** 用户 ruleset synthetic key 前缀。 */
export const USER_RULESET_PREFIX = 'user:';

/** 生成用户 ruleset 的 synthetic key。 */
export function userRulesetKey(rulesetId: string): string {
    return `${USER_RULESET_PREFIX}${rulesetId}`;
}

/** 判断 rulesetId 是否为用户 ruleset synthetic key。 */
export function isUserRulesetKey(id: string): boolean {
    return id.startsWith(USER_RULESET_PREFIX);
}

/** 从 synthetic key 提取用户 ruleset UUID。 */
export function extractUserRulesetId(key: string): string {
    return key.slice(USER_RULESET_PREFIX.length);
}

/**
 * 校验一个 ruleset 的内部引用合法性，并填充默认字段（portrait/face/frame）。
 * 内置 rulesets 在模块加载时调用；用户 ruleset 通过 getMergedRuleset 调用。
 *
 * 抛出 Error 时表示 ruleset 数据非法（开发期 bug 或用户数据被破坏）。
 */
function validateRuleset(name: string, ruleset: Ruleset): void {
    const { prints, sideDecks, sigilParams } = ruleset;
    for (const [id, card] of Object.entries(prints) as [string, CardPrint][]) {
        if (card.evolution && !Object.hasOwn(prints, card.evolution))
            throw new Error(`Card ${card.name} references invalid evolution ${card.evolution}`);
        if (!card.portrait) card.portrait = id;
        if (card.rare) {
            if (card.noSac) card.face ??= 'rare_terrain';
            else card.face ??= 'rare';
            if (card.scrybe) card.frame ??= `${card.scrybe}_frame`;
        }
        if (card.noSac) card.face ??= 'terrain';
    }
    for (const [, sideDeck] of Object.entries(sideDecks) as [string, SideDeck][]) {
        if (sideDeck.repeat && !Object.hasOwn(prints, sideDeck.repeat[1]))
            throw new Error(`Side deck ${sideDeck.name} references invalid print ${sideDeck.repeat[1]}`);
        if (sideDeck.singleCat) {
            for (const [cat, [count, printId]] of Object.entries(sideDeck.singleCat)) {
                if (!Object.hasOwn(prints, printId))
                    throw new Error(`Side deck ${sideDeck.name} category ${cat} references invalid print ${printId}`);
            }
        }
        if (sideDeck.draft) {
            for (const printId of sideDeck.draft.cards) {
                if (!Object.hasOwn(prints, printId))
                    throw new Error(`Side deck ${sideDeck.name} draft references invalid print ${printId}`);
            }
        }
    }
    for (const [sigil, params] of Object.entries(sigilParams)) {
        const sigilInfo = sigilInfos[sigil];
        if (!sigilInfo) throw new Error(`Ruleset ${name} references unknown sigil ${sigil}`);
        for (let i = 0; i < params.length; i++) {
            if (sigilInfo.params?.[i] === 'print' && !prints[params[i]])
                throw new Error(`Params for ${sigil} in ${name} references invalid print ${params[i]}`);
        }
    }
}

// Check validity of references & fill in defaults for built-in rulesets
for (const [ruleset, data] of Object.entries(rulesets)) {
    validateRuleset(ruleset, data);
}

/**
 * Phase 3 UGC：将用户 override 数据与内置 base ruleset 深度合并，返回可用的 Ruleset。
 *
 * 合并规则：
 * - prints：对已有 id 深度合并（Partial<CardPrint>）；新增 id 直接加入（必须完整 CardPrint）。
 * - sideDecks/sigilParams：整体替换某 id（不深度合并）。
 * - options 不在此函数处理范围——FightOptions 是独立概念，由 getMergedFightOptions 处理。
 *
 * 校验：合并后调用 validateRuleset 检查所有引用合法性（evolution/sideDeck/sigilParams 引用的 print 必须存在）。
 * 校验失败时抛 Error，调用方（tRPC handler）应 catch 并返回 400。
 */
export function getMergedRuleset(baseId: string, override: UserRulesetData, name?: string): Ruleset {
    const base = rulesets[baseId];
    if (!base) throw new Error(`Unknown base ruleset: ${baseId}`);

    // 深度合并 prints：对已有 id 覆盖字段，新增 id 直接加入
    // 注意：override.prints 的 sigils 是 string[]（Zod schema 限制），合并时 cast 为 Sigil[]
    const mergedPrints: Record<string, CardPrint> = { ...base.prints };
    if (override.prints) {
        for (const [id, partial] of Object.entries(override.prints)) {
            const existing = mergedPrints[id];
            if (existing) {
                // 深度合并：覆盖指定字段，未指定的保留 base
                mergedPrints[id] = { ...existing, ...partial } as CardPrint;
            } else {
                // 新增 print：必须含必要字段（由 tRPC 层的 zUserRulesetData Zod schema 保证类型）
                mergedPrints[id] = { ...partial } as CardPrint;
            }
        }
    }

    // sideDecks/sigilParams：整体覆盖某 id
    const mergedSideDecks: Record<string, SideDeck> = { ...base.sideDecks, ...override.sideDecks };
    const mergedSigilParams: Record<string, (string | number)[]> = { ...base.sigilParams, ...override.sigilParams };

    const merged: Ruleset = {
        name: name ?? base.name,
        prints: mergedPrints,
        sideDecks: mergedSideDecks,
        sigilParams: mergedSigilParams,
    };

    validateRuleset(baseId, merged);
    return merged;
}
