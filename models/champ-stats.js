'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var ChampStatsSchema = new Schema({
    accountId : Number,
    lastTimeStamp : Number,
    stats : [{
        id: String,
        wins: Number,
        losses: Number,
        doubleKills: Number,
        tripleKills: Number,
        quadraKills: Number,
        pentaKills: Number,
        kills: Number,
        deaths: Number,
        assists: Number,
        totalMinionsKilled: Number,
        wardsPlaced: Number
    }]
})

module.exports = mongoose.model('ChampStats',ChampStatsSchema);