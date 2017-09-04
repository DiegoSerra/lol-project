'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var MatchSchema = new Schema({
    accountId : Number,
    timestamp : Number,
    match : {
        id : Number,
        mapId : Number,
        queueId : Number,
        gameDuration: String,
        gameCreation : String,
        participants : [{
            id : Number,
            summonerId: Number,
            summonerName : String,
            champion: String,
            score: String,
            champLevel: Number,
            spell1: String,
            spell2: String,
            items: [{
                id: Number,
                image: String
            }],
            runes: [{
                id: String,
                rank: Number
            }],
            masteries: [{
                id: String,
                rank: Number 
            }]
        }]
    }
})

module.exports = mongoose.model('match', MatchSchema);