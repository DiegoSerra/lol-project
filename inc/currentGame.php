<?php

require_once('conexion.php');
require_once('../api/CurrentGame/CurrentGameInfo.php');

if(!empty($_GET["summoner_name"])) {
	
	$summoner_name = $_GET["summoner_name"];
	$api = new riotapi($region, new FileSystemCache('../cache/'));

	try {
	    $r = $api->getSummonerByName($summoner_name);
	    $summoner_id = $r["id"];
	    $currentGame;

	    try {
	    	$currentGame = $api->getCurrentGame($summoner_id);
	    }catch(Exception $e){
	    	if($api->getLastResponseCode() == 404){
	    		echo $summoner_name . " no está en partida.";
	    		return;
	    	}
	    }

	    $currentGameInfo = new CurrentGameInfo($currentGame);

	    foreach($currentGameInfo->participants as $player){
	    	echo "Name: " . $player->summonerName . " ChampionId: <img src=\"" . $player->championClass->getChampionIcon() . "\">" . " Spell1: <img src=\"" . $player->spell1Class->getSpellIcon() . "\">" . " Spell2: <img src=\"" . $player->spell2Class->getSpellIcon() . "\">" . " League[" . $player->leaguePositionSoloQ->getLeagueName() . " - " . $player->leaguePositionSoloQ->leaguePoints ."]: <img src=\"" . $player->leaguePositionSoloQ->getLeagueIcon() . "\">" . " Promo:[" . $player->leaguePositionSoloQ->seriesResult() . "]" . " RankedStats: " .$player->leaguePositionSoloQ->wins . "/" . $player->leaguePositionSoloQ->losses . "<br>";
	    }

	} catch(Exception $e) {
	    echo "Error: " . $e->getMessage();
	};
} else {
	echo "Problema con la peticion";
}

?>