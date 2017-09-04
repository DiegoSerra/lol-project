var express = require('express'),
    app = express(),
    mongoose = require('mongoose'),
    ChampStats = require('../models/champ-stats'),
    MatchModel = require('../models/match'),
    cors = require('cors'),
    async = require('async'),
    LolApi = require('leagueapi'),
    fs = require('fs'),
    dateFormat = require('dateformat'),
    config = require('./config');

/* JSONS */
let championCont = JSON.parse(fs.readFileSync('../json/champion.json')),
    spellCont = JSON.parse(fs.readFileSync('../json/summoner.json')),
    itemCont = JSON.parse(fs.readFileSync('../json/item.json')),
    masteryCont = JSON.parse(fs.readFileSync('../json/mastery.json')),
    runeCont = JSON.parse(fs.readFileSync('../json/rune.json')),
    profileIconCont = JSON.parse(fs.readFileSync('../json/profileicon.json')); 
    
/* DB */
mongoose.Promise = Promise;
let urlDb = config.db;
mongoose.connect(urlDb, {
    useMongoClient: true
});
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to ' + urlDb);
});

/* Access control */
app.use(cors());

/* Match list code */
app.get('/matchList', (req,res) => {
    LolApi.init(config.apiKey, req.query.region);
    LolApi.setRateLimit(config.demoKeyRateLimitPer10s,config.demoKeyRateLimitPer10m);
    //LolApi.setRateLimit(config.productionKeyRateLimitPer10s,config.productionKeyRateLimitPer10m) Product api key 
    LolApi.Summoner.getByName(req.query.summoner_name, (err,summoner) => {
        let matchListObj = {},
            myParticipantId,
            options = {
                endIndex : 20
            };
        if(!err){
            matchListObj.summoner_name = summoner.name;
            matchListObj.level = summoner.summonerLevel;
            matchListObj.summonerId = summoner.id;
            matchListObj.accountId = summoner.accountId;
            matchListObj.profileIconId = profileIconCont.data[summoner.profileIconId].image.full;
            async.parallel([
                /* Get Leagues */
                callback => {
                    LolApi.League.getPositions(summoner.id,(err,league) => {
                        matchListObj.leagues = [];
                        for(let i in league){
                            let leag = {};
                            leag.queueType = league[i].queueType;                  
                            leag.leagueName = league[i].leagueName;
                            leag.rank = league[i].tier + " " + league[i].rank;
                            leag.lp = league[i].leaguePoints;
                            if(league[i].miniSeries) leag.miniSeries = league[i].miniSeries.progress;
                            leag.wins = league[i].wins;
                            leag.losses = league[i].losses;
                            matchListObj.leagues.push(leag);
                        }
                        callback(null,null);
                    })
                },
                /* Get Matches */
                callback => {
                    LolApi.Match.getMatchLists(summoner.accountId, options, (err,matchList) => {
                        matchListObj.matches = [];
                        let options = { 
                            forAccountId: summoner.accountId 
                        }                  
                        MatchModel.find({accountId: summoner.accountId}).sort({timestamp : -1}).exec((err,matchesData) => { 
                            if(matchesData.length == 0){
                                async.forEach(matchList.matches,(item,forEachCallback) => { 
                                    let matchDb = new MatchModel();
                                    LolApi.Match.getMatch(item.gameId,options,(err, match) => {                                                      
                                        if(!err){   
                                            let matchInfo = {};                                
                                            matchInfo.id = match.gameId;
                                            matchInfo.mapId = match.mapId;
                                            matchInfo.queueId = match.queueId;
                                            let minutes = Math.floor(match.gameDuration / 60.0);
                                            let seconds = match.gameDuration % 60;
                                            matchInfo.gameDuration = minutes + ":" + seconds;
                                            matchInfo.gameCreation = dateFormat(new Date(match.gameCreation));
                                            matchInfo.participants = [];
                                            /* ParticipantIdentities */
                                            async.forEach(match.participantIdentities, (participantIdentity,forParticipantIdentityCallback) => { 
                                                let participantIdentityInfo = {};
                                                participantIdentityInfo.id = participantIdentity.participantId;                                                                                      
                                                if(participantIdentity.player != null){                                                                                                     
                                                    participantIdentityInfo.summonerId = participantIdentity.player.summonerId;                                                             
                                                    participantIdentityInfo.summonerName = participantIdentity.player.summonerName;                                                                                                                          
                                                }                                                             
                                                if(participantIdentity.player != null && participantIdentity.player.accountId == summoner.accountId){
                                                    myParticipantId = participantIdentity.participantId;
                                                    participantIdentityInfo.win = participantIdentity.participantId <= match.participantIdentities.length / 2 ?  match.teams[0].win : match.teams[1].win;
                                                }
                                                matchInfo.participants.push(participantIdentityInfo);
                                                forParticipantIdentityCallback();
                                            }); 
    
                                            /* Participants */
                                            async.forEach(match.participants, (participant,forParticipantCallback) => {
                                                let optionsImage = { tags: 'image' };                              
                                                /* Champions */
                                                for(let champion in championCont.data){
                                                    if(participant.championId == championCont.data[champion].key) {
                                                        matchInfo.participants[participant.participantId - 1].champion = championCont.data[champion].image.full;
                                                        break;
                                                    }
                                                } 
                                                /* KDA */
                                                matchInfo.participants[participant.participantId - 1].score = participant.stats.kills + "/" + participant.stats.deaths + "/" + participant.stats.assists;
                                                /* Champion Level */
                                                matchInfo.participants[participant.participantId - 1].champLevel = participant.stats.champLevel;
    
                                                if(myParticipantId == participant.participantId){
                                                    matchInfo.participants[participant.participantId - 1].items = []; 
                                                    matchInfo.participants[participant.participantId - 1].runes = []; 
                                                    matchInfo.participants[participant.participantId - 1].masteries = [];
    
                                                    /* Summoner Spells */
                                                    for(let summonerSpell in spellCont.data){
                                                        if(participant.spell1Id == spellCont.data[summonerSpell].key) {
                                                            matchInfo.participants[participant.participantId - 1].spell1 = spellCont.data[summonerSpell].image.full;
                                                        }
                                                        if(participant.spell2Id == spellCont.data[summonerSpell].key) {
                                                            matchInfo.participants[participant.participantId - 1].spell2 = spellCont.data[summonerSpell].image.full;
                                                        }
                                                    }
                                                    /* Runes */
                                                    async.forEach(participant.runes, (runeMatch,runeCallback) => {
                                                        let rune = {};
                                                        rune.id = runeCont.data[runeMatch.runeId].image.full;
                                                        rune.rank = runeMatch.rank;
                                                        matchInfo.participants[participant.participantId - 1].runes.push(rune);
                                                        runeCallback(null,null);    
                                                    })
                                                    /* Masteries */
                                                    async.forEach(participant.masteries, (masteryMatch,masteryCallback) => {
                                                        let mastery = {};
                                                        mastery.id = masteryCont.data[masteryMatch.masteryId].image.full;
                                                        mastery.rank = masteryMatch.rank;
                                                        matchInfo.participants[participant.participantId - 1].masteries.push(mastery);
                                                        masteryCallback(null,null);                                                            
                                                    })
                                                    /* Items */
                                                    try{             
                                                        matchInfo.participants[participant.participantId - 1].items.push({ id : 0 , image : itemCont.data[participant.stats.item0].image.full});                                            
                                                        matchInfo.participants[participant.participantId - 1].items.push({ id : 1 , image : itemCont.data[participant.stats.item1].image.full});                                            
                                                        matchInfo.participants[participant.participantId - 1].items.push({ id : 2 , image : itemCont.data[participant.stats.item2].image.full});                                            
                                                        matchInfo.participants[participant.participantId - 1].items.push({ id : 3 , image : itemCont.data[participant.stats.item3].image.full});                                            
                                                        matchInfo.participants[participant.participantId - 1].items.push({ id : 4 , image : itemCont.data[participant.stats.item4].image.full});                                            
                                                        matchInfo.participants[participant.participantId - 1].items.push({ id : 5 , image : itemCont.data[participant.stats.item5].image.full});                                            
                                                        matchInfo.participants[participant.participantId - 1].items.push({ id : 6 , image : itemCont.data[participant.stats.item6].image.full});                                            
                                                    } catch (e) {
                                                    }                                            
                                                }
                                                forParticipantCallback();                                                                                                                                       
                                            });                                                                                         
                                            matchDb.accountId = summoner.accountId;
                                            matchDb.timestamp = item.timestamp;
                                            matchDb.match = matchInfo;
                                            matchDb.save((err,matchStore) => {
                                                /* Send Object */   
                                                matchListObj.matches.push(matchStore);
                                            })
                                        }
                                        forEachCallback();                                                                         
                                    });
                                }, err => {                   
                                    if(err) return callback(null,null);
                                    callback(null,null);
                                });
                            } else {                               
                                async.forEachSeries(matchList.matches,(item,forEachCallback) => {
                                    let matchDb = new MatchModel();
                                    if(item.timestamp > matchesData[0].timestamp){
                                        LolApi.Match.getMatch(item.gameId,options,(err, match) => {                                                      
                                            if(!err){   
                                                let matchInfo = {};                                
                                                matchInfo.id = match.gameId;
                                                matchInfo.mapId = match.mapId;
                                                matchInfo.queueId = match.queueId;
                                                let minutes = Math.floor(match.gameDuration / 60.0);
                                                let seconds = match.gameDuration % 60;
                                                matchInfo.gameDuration = minutes + ":" + seconds;
                                                matchInfo.gameCreation = dateFormat(new Date(match.gameCreation));
                                                matchInfo.participants = [];
                                                /* ParticipantIdentities */
                                                async.forEach(match.participantIdentities, (participantIdentity,forParticipantIdentityCallback) => { 
                                                    let participantIdentityInfo = {};
                                                    participantIdentityInfo.id = participantIdentity.participantId;                                                                                      
                                                    if(participantIdentity.player != null){                                                                                                     
                                                        participantIdentityInfo.summonerId = participantIdentity.player.summonerId;                                                             
                                                        participantIdentityInfo.summonerName = participantIdentity.player.summonerName;                                                                                                                          
                                                    }                                                             
                                                    if(participantIdentity.player != null && participantIdentity.player.accountId == summoner.accountId){
                                                        myParticipantId = participantIdentity.participantId;
                                                        participantIdentityInfo.win = participantIdentity.participantId <= match.participantIdentities.length / 2 ?  match.teams[0].win : match.teams[1].win;
                                                    }
                                                    matchInfo.participants.push(participantIdentityInfo);
                                                    forParticipantIdentityCallback();
                                                }); 
        
                                                /* Participants */
                                                async.forEach(match.participants, (participant,forParticipantCallback) => {
                                                    let optionsImage = { tags: 'image' };                              
                                                    /* Champions */
                                                    for(let champion in championCont.data){
                                                        if(participant.championId == championCont.data[champion].key) {
                                                            matchInfo.participants[participant.participantId - 1].champion = championCont.data[champion].image.full;
                                                            break;
                                                        }
                                                    } 
                                                    /* KDA */
                                                    matchInfo.participants[participant.participantId - 1].score = participant.stats.kills + "/" + participant.stats.deaths + "/" + participant.stats.assists;
                                                    /* Champion Level */
                                                    matchInfo.participants[participant.participantId - 1].champLevel = participant.stats.champLevel;
        
                                                    if(myParticipantId == participant.participantId){
                                                        matchInfo.participants[participant.participantId - 1].items = []; 
                                                        matchInfo.participants[participant.participantId - 1].runes = []; 
                                                        matchInfo.participants[participant.participantId - 1].masteries = [];
        
                                                        /* Summoner Spells */
                                                        for(let summonerSpell in spellCont.data){
                                                            if(participant.spell1Id == spellCont.data[summonerSpell].key) {
                                                                matchInfo.participants[participant.participantId - 1].spell1 = spellCont.data[summonerSpell].image.full;
                                                            }
                                                            if(participant.spell2Id == spellCont.data[summonerSpell].key) {
                                                                matchInfo.participants[participant.participantId - 1].spell2 = spellCont.data[summonerSpell].image.full;
                                                            }
                                                        }
                                                        /* Runes */
                                                        async.forEach(participant.runes, (runeMatch,runeCallback) => {
                                                            let rune = {};
                                                            rune.id = runeCont.data[runeMatch.runeId].image.full;
                                                            rune.rank = runeMatch.rank;
                                                            matchInfo.participants[participant.participantId - 1].runes.push(rune);
                                                            runeCallback(null,null);    
                                                        })
                                                        /* Masteries */
                                                        async.forEach(participant.masteries, (masteryMatch,masteryCallback) => {
                                                            let mastery = {};
                                                            mastery.id = masteryCont.data[masteryMatch.masteryId].image.full;
                                                            mastery.rank = masteryMatch.rank;
                                                            matchInfo.participants[participant.participantId - 1].masteries.push(mastery);
                                                            masteryCallback(null,null);                                                            
                                                        })
                                                        /* Items */
                                                        try{             
                                                            matchInfo.participants[participant.participantId - 1].items.push({ id : 0 , image : itemCont.data[participant.stats.item0].image.full});                                            
                                                            matchInfo.participants[participant.participantId - 1].items.push({ id : 1 , image : itemCont.data[participant.stats.item1].image.full});                                            
                                                            matchInfo.participants[participant.participantId - 1].items.push({ id : 2 , image : itemCont.data[participant.stats.item2].image.full});                                            
                                                            matchInfo.participants[participant.participantId - 1].items.push({ id : 3 , image : itemCont.data[participant.stats.item3].image.full});                                            
                                                            matchInfo.participants[participant.participantId - 1].items.push({ id : 4 , image : itemCont.data[participant.stats.item4].image.full});                                            
                                                            matchInfo.participants[participant.participantId - 1].items.push({ id : 5 , image : itemCont.data[participant.stats.item5].image.full});                                            
                                                            matchInfo.participants[participant.participantId - 1].items.push({ id : 6 , image : itemCont.data[participant.stats.item6].image.full});                                            
                                                        } catch (e) {
                                                        }                                            
                                                    }
                                                    forParticipantCallback();                                                                                                                                       
                                                });                                                                                         
                                                matchDb.accountId = summoner.accountId;
                                                matchDb.timestamp = item.timestamp;
                                                matchDb.match = matchInfo;
                                                matchListObj.matches.push(matchDb);
                                                matchDb.save();
                                            }
                                            forEachCallback();                                                                         
                                        });
                                    } else {
                                        /* Load db */ 
                                        for(matchData of matchesData){
                                            matchListObj.matches.push(matchData);
                                        }                                                                                                                                        
                                        return forEachCallback({err : "stop"});                                                                                                                                                              
                                    }
                                }, err => {                   
                                    if(err) return callback(null,null);
                                    callback(null,null);
                                });
                            } 
                        });                                             
                    });
                }
            ], (err) => {
                res.send(matchListObj); 
            })
        } else {
            res.send("No existe ese nombre de invocador");
        }
    })
});

/* More matches code */ //FIX
app.get('/more-matches', (req,res) => {
    LolApi.init(config.apiKey, req.query.region);
    LolApi.setRateLimit(config.demoKeyRateLimitPer10s,config.demoKeyRateLimitPer10m);
    //LolApi.setRateLimit(config.productionKeyRateLimitPer10s,config.productionKeyRateLimitPer10m) Product api key 
    LolApi.Summoner.getByName(req.query.summoner_name, (err,summoner) => {
        let matchListObj = {},
            myParticipantId,
            options = {
                beginIndex: req.query.id * 20,
                endIndex : 20 + req.query.id * 20 
            };
        if(!err){
            matchListObj.summoner_name = summoner.name;
            matchListObj.level = summoner.summonerLevel;
            matchListObj.summonerId = summoner.id;
            matchListObj.accountId = summoner.accountId;
            matchListObj.profileIconId = profileIconCont.data[summoner.profileIconId].image.full;

            /* Get Matches */
            LolApi.Match.getMatchLists(summoner.accountId, options, (err,matchList) => {
                matchListObj.matches = [];
                let options = { 
                    forAccountId: summoner.accountId 
                }                  
                MatchModel.find({accountId: summoner.accountId}).sort({timestamp : -1}).exec((err,matchesData) => { 
                    if(matchesData.length == 0){
                        async.forEach(matchList.matches,(item,forEachCallback) => { 
                            let matchDb = new MatchModel();
                            LolApi.Match.getMatch(item.gameId,options,(err, match) => {                                                      
                                if(!err){   
                                    let matchInfo = {};                                
                                    matchInfo.id = match.gameId;
                                    matchInfo.mapId = match.mapId;
                                    matchInfo.queueId = match.queueId;
                                    let minutes = Math.floor(match.gameDuration / 60.0);
                                    let seconds = match.gameDuration % 60;
                                    matchInfo.gameDuration = minutes + ":" + seconds;
                                    matchInfo.gameCreation = dateFormat(new Date(match.gameCreation));
                                    matchInfo.participants = [];
                                    /* ParticipantIdentities */
                                    async.forEach(match.participantIdentities, (participantIdentity,forParticipantIdentityCallback) => { 
                                        let participantIdentityInfo = {};
                                        participantIdentityInfo.id = participantIdentity.participantId;                                                                                      
                                        if(participantIdentity.player != null){                                                                                                     
                                            participantIdentityInfo.summonerId = participantIdentity.player.summonerId;                                                             
                                            participantIdentityInfo.summonerName = participantIdentity.player.summonerName;                                                                                                                          
                                        }                                                             
                                        if(participantIdentity.player != null && participantIdentity.player.accountId == summoner.accountId){
                                            myParticipantId = participantIdentity.participantId;
                                            participantIdentityInfo.win = participantIdentity.participantId <= match.participantIdentities.length / 2 ?  match.teams[0].win : match.teams[1].win;
                                        }
                                        matchInfo.participants.push(participantIdentityInfo);
                                        forParticipantIdentityCallback();
                                    }); 

                                    /* Participants */
                                    async.forEach(match.participants, (participant,forParticipantCallback) => {
                                        let optionsImage = { tags: 'image' };                              
                                        /* Champions */
                                        for(let champion in championCont.data){
                                            if(participant.championId == championCont.data[champion].key) {
                                                matchInfo.participants[participant.participantId - 1].champion = championCont.data[champion].image.full;
                                                break;
                                            }
                                        } 
                                        /* KDA */
                                        matchInfo.participants[participant.participantId - 1].score = participant.stats.kills + "/" + participant.stats.deaths + "/" + participant.stats.assists;
                                        /* Champion Level */
                                        matchInfo.participants[participant.participantId - 1].champLevel = participant.stats.champLevel;

                                        if(myParticipantId == participant.participantId){
                                            matchInfo.participants[participant.participantId - 1].items = []; 
                                            matchInfo.participants[participant.participantId - 1].runes = []; 
                                            matchInfo.participants[participant.participantId - 1].masteries = [];

                                            /* Summoner Spells */
                                            for(let summonerSpell in spellCont.data){
                                                if(participant.spell1Id == spellCont.data[summonerSpell].key) {
                                                    matchInfo.participants[participant.participantId - 1].spell1 = spellCont.data[summonerSpell].image.full;
                                                }
                                                if(participant.spell2Id == spellCont.data[summonerSpell].key) {
                                                    matchInfo.participants[participant.participantId - 1].spell2 = spellCont.data[summonerSpell].image.full;
                                                }
                                            }
                                            /* Runes */
                                            async.forEach(participant.runes, (runeMatch,runeCallback) => {
                                                let rune = {};
                                                rune.id = runeCont.data[runeMatch.runeId].image.full;
                                                rune.rank = runeMatch.rank;
                                                matchInfo.participants[participant.participantId - 1].runes.push(rune);
                                                runeCallback(null,null);    
                                            })
                                            /* Masteries */
                                            async.forEach(participant.masteries, (masteryMatch,masteryCallback) => {
                                                let mastery = {};
                                                mastery.id = masteryCont.data[masteryMatch.masteryId].image.full;
                                                mastery.rank = masteryMatch.rank;
                                                matchInfo.participants[participant.participantId - 1].masteries.push(mastery);
                                                masteryCallback(null,null);                                                            
                                            })
                                            /* Items */
                                            try{             
                                                matchInfo.participants[participant.participantId - 1].items.push({ id : 0 , image : itemCont.data[participant.stats.item0].image.full});                                            
                                                matchInfo.participants[participant.participantId - 1].items.push({ id : 1 , image : itemCont.data[participant.stats.item1].image.full});                                            
                                                matchInfo.participants[participant.participantId - 1].items.push({ id : 2 , image : itemCont.data[participant.stats.item2].image.full});                                            
                                                matchInfo.participants[participant.participantId - 1].items.push({ id : 3 , image : itemCont.data[participant.stats.item3].image.full});                                            
                                                matchInfo.participants[participant.participantId - 1].items.push({ id : 4 , image : itemCont.data[participant.stats.item4].image.full});                                            
                                                matchInfo.participants[participant.participantId - 1].items.push({ id : 5 , image : itemCont.data[participant.stats.item5].image.full});                                            
                                                matchInfo.participants[participant.participantId - 1].items.push({ id : 6 , image : itemCont.data[participant.stats.item6].image.full});                                            
                                            } catch (e) {
                                            }                                            
                                        }
                                        forParticipantCallback();                                                                                                                                       
                                    });                                                                                         
                                    matchDb.accountId = summoner.accountId;
                                    matchDb.timestamp = item.timestamp;
                                    matchDb.match = matchInfo;
                                    matchDb.save((err,matchStore) => {
                                        /* Send Object */   
                                        matchListObj.matches.push(matchStore);
                                    })
                                }
                                forEachCallback();                                                                         
                            });
                        }, err => {                   
                            if(err) return res.send(matchListObj);
                            res.send(matchListObj);
                        });
                    } else {                               
                        async.forEachSeries(matchList.matches,(item,forEachCallback) => {
                            let matchDb = new MatchModel();
                            if(item.timestamp > matchesData[19].timestamp){
                                LolApi.Match.getMatch(item.gameId,options,(err, match) => {                                                      
                                    if(!err){   
                                        let matchInfo = {};                                
                                        matchInfo.id = match.gameId;
                                        matchInfo.mapId = match.mapId;
                                        matchInfo.queueId = match.queueId;
                                        let minutes = Math.floor(match.gameDuration / 60.0);
                                        let seconds = match.gameDuration % 60;
                                        matchInfo.gameDuration = minutes + ":" + seconds;
                                        matchInfo.gameCreation = dateFormat(new Date(match.gameCreation));
                                        matchInfo.participants = [];
                                        /* ParticipantIdentities */
                                        async.forEach(match.participantIdentities, (participantIdentity,forParticipantIdentityCallback) => { 
                                            let participantIdentityInfo = {};
                                            participantIdentityInfo.id = participantIdentity.participantId;                                                                                      
                                            if(participantIdentity.player != null){                                                                                                     
                                                participantIdentityInfo.summonerId = participantIdentity.player.summonerId;                                                             
                                                participantIdentityInfo.summonerName = participantIdentity.player.summonerName;                                                                                                                          
                                            }                                                             
                                            if(participantIdentity.player != null && participantIdentity.player.accountId == summoner.accountId){
                                                myParticipantId = participantIdentity.participantId;
                                                participantIdentityInfo.win = participantIdentity.participantId <= match.participantIdentities.length / 2 ?  match.teams[0].win : match.teams[1].win;
                                            }
                                            matchInfo.participants.push(participantIdentityInfo);
                                            forParticipantIdentityCallback();
                                        }); 

                                        /* Participants */
                                        async.forEach(match.participants, (participant,forParticipantCallback) => {
                                            let optionsImage = { tags: 'image' };                              
                                            /* Champions */
                                            for(let champion in championCont.data){
                                                if(participant.championId == championCont.data[champion].key) {
                                                    matchInfo.participants[participant.participantId - 1].champion = championCont.data[champion].image.full;
                                                    break;
                                                }
                                            } 
                                            /* KDA */
                                            matchInfo.participants[participant.participantId - 1].score = participant.stats.kills + "/" + participant.stats.deaths + "/" + participant.stats.assists;
                                            /* Champion Level */
                                            matchInfo.participants[participant.participantId - 1].champLevel = participant.stats.champLevel;

                                            if(myParticipantId == participant.participantId){
                                                matchInfo.participants[participant.participantId - 1].items = []; 
                                                matchInfo.participants[participant.participantId - 1].runes = []; 
                                                matchInfo.participants[participant.participantId - 1].masteries = [];

                                                /* Summoner Spells */
                                                for(let summonerSpell in spellCont.data){
                                                    if(participant.spell1Id == spellCont.data[summonerSpell].key) {
                                                        matchInfo.participants[participant.participantId - 1].spell1 = spellCont.data[summonerSpell].image.full;
                                                    }
                                                    if(participant.spell2Id == spellCont.data[summonerSpell].key) {
                                                        matchInfo.participants[participant.participantId - 1].spell2 = spellCont.data[summonerSpell].image.full;
                                                    }
                                                }
                                                /* Runes */
                                                async.forEach(participant.runes, (runeMatch,runeCallback) => {
                                                    let rune = {};
                                                    rune.id = runeCont.data[runeMatch.runeId].image.full;
                                                    rune.rank = runeMatch.rank;
                                                    matchInfo.participants[participant.participantId - 1].runes.push(rune);
                                                    runeCallback(null,null);    
                                                })
                                                /* Masteries */
                                                async.forEach(participant.masteries, (masteryMatch,masteryCallback) => {
                                                    let mastery = {};
                                                    mastery.id = masteryCont.data[masteryMatch.masteryId].image.full;
                                                    mastery.rank = masteryMatch.rank;
                                                    matchInfo.participants[participant.participantId - 1].masteries.push(mastery);
                                                    masteryCallback(null,null);                                                            
                                                })
                                                /* Items */
                                                try{             
                                                    matchInfo.participants[participant.participantId - 1].items.push({ id : 0 , image : itemCont.data[participant.stats.item0].image.full});                                            
                                                    matchInfo.participants[participant.participantId - 1].items.push({ id : 1 , image : itemCont.data[participant.stats.item1].image.full});                                            
                                                    matchInfo.participants[participant.participantId - 1].items.push({ id : 2 , image : itemCont.data[participant.stats.item2].image.full});                                            
                                                    matchInfo.participants[participant.participantId - 1].items.push({ id : 3 , image : itemCont.data[participant.stats.item3].image.full});                                            
                                                    matchInfo.participants[participant.participantId - 1].items.push({ id : 4 , image : itemCont.data[participant.stats.item4].image.full});                                            
                                                    matchInfo.participants[participant.participantId - 1].items.push({ id : 5 , image : itemCont.data[participant.stats.item5].image.full});                                            
                                                    matchInfo.participants[participant.participantId - 1].items.push({ id : 6 , image : itemCont.data[participant.stats.item6].image.full});                                            
                                                } catch (e) {
                                                }                                            
                                            }
                                            forParticipantCallback();                                                                                                                                       
                                        });                                                                                         
                                        matchDb.accountId = summoner.accountId;
                                        matchDb.timestamp = item.timestamp;
                                        matchDb.match = matchInfo;
                                        matchListObj.matches.push(matchDb);
                                        matchDb.save();
                                    }
                                    forEachCallback();                                                                         
                                });
                            } else {
                                /* Load db */ 
                                for(matchData of matchesData){
                                    matchListObj.matches.push(matchData);
                                }                                                                                                                                        
                                return forEachCallback({err : "stop"});                                                                                                                                                              
                            }
                        }, err => {                   
                            if(err) return res.send(matchListObj);
                            res.send(matchListObj);
                        });
                    } 
                });                                             
            });
        } else {
            res.send("No existe ese nombre de invocador");
        }
    })
});

/* Current game code */
app.get('/currentGame' , (req,res) => {
    let currentGameObj = {};
    currentGameObj.participants = [];
    let options = { tags: 'image' };
    LolApi.init(config.apiKey, req.query.region);
    LolApi.setRateLimit(config.demoKeyRateLimitPer10s,config.demoKeyRateLimitPer10m);
    //LolApi.setRateLimit(config.productionKeyRateLimitPer10s,config.productionKeyRateLimitPer10m) Product api key
    LolApi.Spectator.getCurrentGame(req.query.summonerId,(err, currentGame) => { 
        if(!err){ 
            currentGameObj.gameType = currentGame.gameQueueConfigId;
            currentGameObj.mapId = currentGame.mapId;
            currentGameObj.bannedChampions = [];
            for(let bannedChamp of currentGame.bannedChampions) {
                let bannedC = {};
                bannedC.pickTurn = bannedChamp.pickTurn;
                for(let champion in championCont.data){
                    if(bannedChamp.championId == championCont.data[champion].key) {
                        bannedC.champion = championCont.data[champion].image.full;
                        break;
                    }
                } 
                bannedC.teamId = bannedChamp.teamId;
                currentGameObj.bannedChampions.push(bannedC);
            }
            async.forEach(currentGame.participants, (participant,eachCallback) => { 
                let partic = {};
                partic.summonerId = participant.summonerId;
                if(participant.summonerName != null) partic.summonerName = participant.summonerName;
                partic.masteries = [];
                partic.runes = [];
                partic.teamId = participant.teamId;
                async.parallel([                              
                    callback => {
                        LolApi.League.getPositions(participant.summonerId, (err,leagues) => {
                            if(!err){
                                for(let league of leagues){
                                    if(league.queueType == 'RANKED_SOLO_5x5'){
                                        partic.league = league.tier + " " + league.rank;
                                        partic.leaguePoints = league.leaguePoints;
                                        if(league.miniSeries) partic.miniSeries = league.miniSeries.progress;
                                        partic.wins = league.wins;
                                        partic.losses = league.losses;                                    
                                    } 
                                }                               
                            }
                            callback(null, null);                          
                        })
                    },

                    callback => {   
                        for(let champion in championCont.data){
                            if(participant.championId == championCont.data[champion].key) {
                                partic.champion = championCont.data[champion].image.full;
                                break;
                            }
                        }   
                        callback(null, null);                      
                    },

                    callback => {
                        for(let summonerSpell in spellCont.data){
                            if(participant.spell1Id == spellCont.data[summonerSpell].key) {
                                partic.spell1 = spellCont.data[summonerSpell].image.full;
                            }
                            if(participant.spell2Id == spellCont.data[summonerSpell].key) {
                                partic.spell2 = spellCont.data[summonerSpell].image.full;
                            }
                        }
                        callback(null, null);
                    },

                    callback => {
                        async.forEach(participant.runes, (runeMatch,runeCallback) => {
                            partic.runes.push({ id: runeCont.data[runeMatch.runeId].image.full, rank: runeMatch.count });
                            runeCallback(null,null);                                                            
                        }, err => {
                            if(!err) callback(null,null);
                        }) 
                    },

                    callback => {
                        async.forEach(participant.masteries, (masteryMatch,masteryCallback) => {
                            partic.masteries.push({ id: masteryCont.data[masteryMatch.masteryId].image.full, rank: masteryMatch.rank })
                            masteryCallback(null,null);                                                            
                        }, err => {
                            if(!err) callback(null,null);
                        }) 
                    }
                ] , err => {
                    if(!err) {
                        currentGameObj.participants.push(partic);
                        eachCallback();
                    }
                }) 
            }, (err) => {
                res.send(currentGameObj);
            })
        } else {
            res.send('No esta en partida');
        }
    });
});

/* Runes code */
app.get('/runes' , (req,res) => {
    LolApi.init(config.apiKey, req.query.region);
    LolApi.setRateLimit(config.demoKeyRateLimitPer10s,config.demoKeyRateLimitPer10m);
    //LolApi.setRateLimit(config.productionKeyRateLimitPer10s,config.productionKeyRateLimitPer10m) Product api key
    LolApi.Runes.getRunes(req.query.summonerId, (err,runePages) => {
        if(!err){
            let runePagesObj = [];
            async.forEach(runePages.pages, (runePage,runePageCallback) => {
                let runeP = {};
                runeP.id = runePage.id;
                runeP.name = runePage.name;
                runeP.current = runePage.current;
                runeP.slots = [];
                async.forEach(runePage.slots, (rune,runeCallback) => {
                    runeP.slots.push({ id: rune.runeSlotId, image: runeCont.data[rune.runeId].image.full})
                    runeCallback();  
                });
                runePagesObj.push(runeP);
                runePageCallback();
            });
            res.send(runePagesObj);
        }    
    });
});

/* Masteries code */
app.get('/masteries', (req,res) => {
    LolApi.init(config.apiKey, req.query.region);
    LolApi.setRateLimit(config.demoKeyRateLimitPer10s,config.demoKeyRateLimitPer10m);
    //LolApi.setRateLimit(config.productionKeyRateLimitPer10s,config.productionKeyRateLimitPer10m) Product api key
    LolApi.Masteries.getMasteries(req.query.summonerId, (err,masteryPages) => {
        if(!err){
            let masteryPagesObj = [];
            async.forEach(masteryPages.pages, (masteryPage,masteryPageCallback) => {
                let masteryP = {};
                masteryP.id = masteryPage.id;
                masteryP.name = masteryPage.id;
                masteryP.current = masteryPage.current;
                masteryP.masteries = [];
                async.forEach(masteryPage.masteries, (mastery,masteryCallback) => {
                    masteryP.masteries.push({ id: masteryCont.data[mastery.id].image.full, rank: mastery.rank})
                    masteryCallback();  
                });
                masteryPagesObj.push(masteryP);
                masteryPageCallback();
            });
            res.send(masteryPagesObj);
        }    
    });
});

/* Champ mastery code */
app.get('/champs-mastery', (req,res) => {
    LolApi.init(config.apiKey, req.query.region);
    LolApi.setRateLimit(config.demoKeyRateLimitPer10s,config.demoKeyRateLimitPer10m);
    //LolApi.setRateLimit(config.productionKeyRateLimitPer10s,config.productionKeyRateLimitPer10m) Product api key
    LolApi.ChampionMastery.getChampions(req.query.summonerId, (err,champsMastery) => {
        if(!err){
            let champsMasteryObj = [];
            for(let champMastery of champsMastery){
                for(let champion in championCont.data){
                    if(champMastery.championId == championCont.data[champion].key) {
                        let champM = {};
                        champM.championPoints = champMastery.championPoints;
                        champM.champion = championCont.data[champion].image.full;
                        champM.championLevel = champMastery.championLevel;
                        champM.championPointsSinceLastLevel = champMastery.championPointsSinceLastLevel;
                        champM.championPointsUntilNextLevel = champMastery.championPointsUntilNextLevel;
                        champsMasteryObj.push(champM);
                        break;
                    }
                }                
            }
            res.send(champsMasteryObj);
        }
    })

});

/* Champ stats code */
app.get('/champ-stats', (req,res) => {
    let champStatDb = new ChampStats();
    ChampStats.findOne({'accountId' : req.query.accountId}, (err,champStatData) => {
        LolApi.init(config.apiKey, req.query.region);
        LolApi.setRateLimit(config.demoKeyRateLimitPer10s,config.demoKeyRateLimitPer10m);
        //LolApi.setRateLimit(config.productionKeyRateLimitPer10s,config.productionKeyRateLimitPer10m) Product api key
        let options = {
            season : '9'    //SEASON 2017
            // beginIndex: '0', //Quitar
            // endIndex: '10'   //Quitar
        };
        if(!champStatData) {    // This is the first time you search the web            
            LolApi.Match.getMatchLists(req.query.accountId, options, (err,matchList) => {
                if(!err) {
                    let champStatsObj = [];
                    let myParticipantId;
                    let win = false;
                    let lastTimeStamp = -1;
                    async.forEach(matchList.matches, (match,matchCallback) => {
                        if(match.timestamp > lastTimeStamp) lastTimeStamp = match.timestamp;
                        LolApi.Match.getMatch(match.gameId, { forAccountId : req.query.accountId } , (err, matchInfo) => {                           
                            if(!err){
                                async.forEach(matchInfo.participantIdentities, (participantIdentity,participantIdentityCallback) => {                                                                                                                                                    
                                    if(participantIdentity.player != null && participantIdentity.player.accountId == req.query.accountId){
                                        myParticipantId = participantIdentity.participantId;
                                        if(myParticipantId <= matchInfo.participantIdentities.length / 2) {
                                            win = matchInfo.teams[0].win;
                                        } else {
                                            win = matchInfo.teams[1].win;
                                        }
                                        participantIdentityCallback();
                                    }                      
                                });
                                async.forEach(matchInfo.participants, (participant, participantCallback) => {
                                    if(participant.participantId == myParticipantId){
                                        let champS = {};
                                        let shared = false;
                                        for(let champion in championCont.data){                                           
                                            if(participant.championId == championCont.data[champion].key) {
                                                for(let c of champStatsObj){
                                                    if(c.id == championCont.data[champion].image.full){
                                                        shared = true;
                                                        c.id = championCont.data[champion].image.full;                                                

                                                        /* Variables added */
                                                        c.doubleKills = c.doubleKills + participant.stats.doubleKills;
                                                        c.tripleKills = c.tripleKills + participant.stats.tripleKills;
                                                        c.quadraKills = c.quadraKills + participant.stats.quadraKills;
                                                        c.pentaKills = c.pentaKills + participant.stats.pentaKills;
    
                                                        /* Variables that need to be converted with the number of matches */                                                
                                                        c.kills = c.kills + participant.stats.kills;
                                                        c.deaths = c.deaths + participant.stats.deaths;
                                                        c.assists = c.assists + participant.stats.assists;
                                                        c.totalMinionsKilled = c.totalMinionsKilled + participant.stats.totalMinionsKilled + participant.stats.neutralMinionsKilled;
                                                        c.wardsPlaced = c.wardsPlaced + participant.stats.wardsPlaced;
    
                                                        /* Wins and losses */
                                                        if(win == 'Win'){
                                                            c.wins = c.wins == null ? 1 : ++c.wins;
                                                        } else {
                                                            c.losses = c.losses == null ? 1 : ++c.losses;
                                                        }
                                                        break;
                                                    }
                                                }
                                                if(!shared) {
                                                    champS.id = championCont.data[champion].image.full;
                                                    champS.wins = 0;
                                                    champS.losses = 0;
                                                    if(win == 'Win'){
                                                        champS.wins = 1;
                                                    } else {
                                                        champS.losses = 1
                                                    }
                                                    champS.doubleKills = participant.stats.doubleKills;
                                                    champS.tripleKills = participant.stats.tripleKills;
                                                    champS.quadraKills = participant.stats.quadraKills;
                                                    champS.pentaKills = participant.stats.pentaKills;
                                                    champS.kills = participant.stats.kills;
                                                    champS.deaths = participant.stats.deaths;
                                                    champS.assists = participant.stats.assists;
                                                    champS.totalMinionsKilled = participant.stats.totalMinionsKilled + participant.stats.neutralMinionsKilled;
                                                    champS.wardsPlaced = participant.stats.wardsPlaced;
                                                }
                                                break;
                                            }
                                        }
                                        if(!shared) champStatsObj.push(champS);
                                        participantCallback();
                                    }
                                });
                            } else {
                                console.log(match.gameId + ' not found');
                            }                     
                            matchCallback();
                        });
                    }, (err) => {               
                        if(!err) {
                            /* Calculate avg variables */                          
                            for(let c of champStatsObj){
                                c.kills = c.kills / (c.wins + c.losses);
                                c.deaths = c.deaths / (c.wins + c.losses);
                                c.assists = c.assists / (c.wins + c.losses);
                                c.totalMinionsKilled = c.totalMinionsKilled / (c.wins + c.losses);
                                c.wardsPlaced = c.kills / (c.wardsPlaced + c.losses);
                            }
                            /* Insert document into db */
                            champStatDb.accountId = req.query.accountId;
                            champStatDb.lastTimeStamp = lastTimeStamp;
                            champStatDb.stats = champStatsObj;
                            champStatDb.save((err,champStatStore) => {
                                /* Send Object */   
                                res.send(champStatStore.stats)
                            })                       
                        }
                    });
                }
            });
        } else {
            options.endIndex = '1';
            let lastTimeStamp = -1;
            let champStatsObj = [];
            let myParticipantId;
            let win = false;
            LolApi.Match.getMatchLists(req.query.accountId, options, (err,matchList) => {
                if(!err){
                    lastTimeStamp = matchList.matches[0].timestamp;
                    if(champStatData.lastTimeStamp < lastTimeStamp){      // Upgrade stats
                        options = {
                            season : '9',
                            beginTime : champStatData.lastTimeStamp
                        }
                        LolApi.Match.getMatchLists(req.query.accountId, options, (err,matchList) => {
                            if(!err){
                                async.forEach(matchList.matches, (match,matchCallback) => {
                                    if(match.timestamp > lastTimeStamp) lastTimeStamp = match.timestamp;
                                    LolApi.Match.getMatch(match.gameId, { forAccountId : req.query.accountId } , (err, matchInfo) => {                           
                                        if(!err){
                                            async.forEach(matchInfo.participantIdentities, (participantIdentity,participantIdentityCallback) => {                                                                                                                                                    
                                                if(participantIdentity.player != null && participantIdentity.player.accountId == req.query.accountId){
                                                    myParticipantId = participantIdentity.participantId;
                                                    if(myParticipantId <= matchInfo.participantIdentities.length / 2) {
                                                        win = matchInfo.teams[0].win;
                                                    } else {
                                                        win = matchInfo.teams[1].win;
                                                    }
                                                    participantIdentityCallback();
                                                }                      
                                            });
                                            async.forEach(matchInfo.participants, (participant, participantCallback) => {
                                                if(participant.participantId == myParticipantId){
                                                    let champS = {};
                                                    let shared = false;
                                                    for(let champion in championCont.data){                                           
                                                        if(participant.championId == championCont.data[champion].key) {
                                                            for(let c of champStatsObj){
                                                                if(c.id == championCont.data[champion].image.full){
                                                                    shared = true;
                                                                    c.id = championCont.data[champion].image.full;                                                
            
                                                                    /* Variables added */
                                                                    c.doubleKills = c.doubleKills + participant.stats.doubleKills;
                                                                    c.tripleKills = c.tripleKills + participant.stats.tripleKills;
                                                                    c.quadraKills = c.quadraKills + participant.stats.quadraKills;
                                                                    c.pentaKills = c.pentaKills + participant.stats.pentaKills;
                
                                                                    /* Variables that need to be converted with the number of matches */                                                
                                                                    c.kills = c.kills + participant.stats.kills;
                                                                    c.deaths = c.deaths + participant.stats.deaths;
                                                                    c.assists = c.assists + participant.stats.assists;
                                                                    c.totalMinionsKilled = c.totalMinionsKilled + participant.stats.totalMinionsKilled + participant.stats.neutralMinionsKilled;
                                                                    c.wardsPlaced = c.wardsPlaced + participant.stats.wardsPlaced;
                
                                                                    /* Wins and losses */
                                                                    if(win == 'Win'){
                                                                        c.wins = c.wins == null ? 1 : ++c.wins;
                                                                    } else {
                                                                        c.losses = c.losses == null ? 1 : ++c.losses;
                                                                    }
                                                                    break;
                                                                }
                                                            }
                                                            if(!shared) {
                                                                champS.id = championCont.data[champion].image.full;
                                                                champS.wins = 0;
                                                                champS.losses = 0;
                                                                if(win == 'Win'){
                                                                    champS.wins = 1;
                                                                } else {
                                                                    champS.losses = 1
                                                                }
                                                                champS.doubleKills = participant.stats.doubleKills;
                                                                champS.tripleKills = participant.stats.tripleKills;
                                                                champS.quadraKills = participant.stats.quadraKills;
                                                                champS.pentaKills = participant.stats.pentaKills;
                                                                champS.kills = participant.stats.kills;
                                                                champS.deaths = participant.stats.deaths;
                                                                champS.assists = participant.stats.assists;
                                                                champS.totalMinionsKilled = participant.stats.totalMinionsKilled + participant.stats.neutralMinionsKilled;
                                                                champS.wardsPlaced = participant.stats.wardsPlaced;
                                                            }
                                                            break;
                                                        }
                                                    }
                                                    if(!shared) champStatsObj.push(champS);
                                                    participantCallback();
                                                }
                                            });
                                        } else {
                                            console.log(match.gameId + ' not found');
                                        }                    
                                        matchCallback();
                                    });
                                }, (err) => {            
                                    if(!err) {
                                        let result = [];
                                        /* Calculate avg variables */                                  
                                        for(let c of champStatsObj) {
                                            let shared = false;
                                            c.kills = c.kills / (c.wins + c.losses);
                                            c.deaths = c.deaths / (c.wins + c.losses);
                                            c.assists = c.assists / (c.wins + c.losses);
                                            c.totalMinionsKilled = c.totalMinionsKilled / (c.wins + c.losses);
                                            c.wardsPlaced = c.wardsPlaced / (c.wins + c.losses);
                                            /* Upgrade champStatsObj */
                                            for(let d of champStatData.stats){
                                                if(d.id == c.id){                                                  
                                                    c.doubleKills += d.doubleKills;
                                                    c.tripleKills += d.tripleKills;
                                                    c.quadraKills += d.quadraKills;
                                                    c.pentaKills += d.pentaKills;
                                                    c.kills = (d.kills * (d.wins + d.losses) + c.kills * (c.wins + c.losses)) / (c.wins + c.losses + d.wins + d.losses);
                                                    c.deaths = (d.deaths * (d.wins + d.losses) + c.deaths * (c.wins + c.losses)) / (c.wins + c.losses + d.wins + d.losses);
                                                    c.assists = (d.assists * (d.wins + d.losses) + c.assists * (c.wins + c.losses)) / (c.wins + c.losses + d.wins + d.losses);
                                                    c.totalMinionsKilled = (d.totalMinionsKilled * (d.wins + d.losses) + c.totalMinionsKilled * (c.wins + c.losses)) / (c.wins + c.losses + d.wins + d.losses);
                                                    c.wardsPlaced = (d.wardsPlaced * (d.wins + d.losses) + c.wardsPlaced * (c.wins + c.losses)) / (c.wins + c.losses + d.wins + d.losses);
                                                    c.wins += d.wins;
                                                    c.losses += d.losses;
                                                    champStatData.stats.splice(champStatData.stats.indexOf(d),1);
                                                    shared = true;
                                                    break;
                                                }
                                            }
                                            if(!shared) result.push(c);
                                        } 
                                        result = champStatsObj.concat(champStatData.stats);                                     

                                        /* Insert document into db */
                                        champStatDb.accountId = req.query.accountId;
                                        champStatDb.stats = result;
                                        champStatDb.lastTimeStamp = lastTimeStamp;
                                        res.send(result);
                                        ChampStats.findOneAndUpdate({'accountId' : champStatDb.accountId},{$set:{stats: champStatDb.stats, lastTimeStamp : champStatDb.lastTimeStamp}},{ new: true }, (err, docs) =>{
                                            //console.log(docs + " updated");
                                        });
                                    }
                                });
                            }
                        });
                    } else {                                           // Load db
                        res.send(champStatData.stats)
                    }
                }
            });           
        }
    }); // End findOne
});

/* Server startup */
app.listen(config.port, () => {  
    console.log('App listening on port ' + config.port);
});



