<?php

	require_once('conexion.php');
	//420: ranked soloq, 400: normal, 440: flexq
	if(!empty($_GET["summoner_name"]) && !empty($_GET["region"])) {
		
		$summoner_name=$_GET["summoner_name"];
		$region=$_GET["region"];
		$api = new riotapi($region, new FileSystemCache('../cache/'));

		try {
		    $r = $api->getSummonerByName($summoner_name);
		    $summoner_id = $r["id"];
		    $account_id = $r["accountId"];
		    $summoner_level = $r["summonerLevel"];
		    $summoner_time = $r["revisionDate"];
		    echo "My info: " . $summoner_id . ", " . $account_id . "<br>";

		    /* Last 20 matches */
		    $params = array(
		    	"beginIndex" => 0,
		    	"endIndex" => 20
	    	);
		    $match_list = $api->getMatchList($account_id,$params)["matches"];

		    foreach($match_list as $match){
		    	$match_id = $match["gameId"];
		    	echo "Match id: " . $match_id . "<br>";
		    	$url = 'https://'.$region.'.api.riotgames.com/lol/match/v3/matches/'.$match_id.'?api_key='.$API_KEY;
		    	$match_info = json_decode(file_get_contents($url),true);
		    	$match_duration = $match_info["gameDuration"];
		    	$minutes = number_format($match_duration/60.0);
		    	$seconds = $match_duration % 60;
		    	echo("Match time: " . $minutes . ":" . $seconds . "<br>");
		    	echo("Match type: " . $TYPE_GAME[$match["queue"]] ."<br>");
		    	echo(date('Y-m-d H:i:s', $match_info["gameCreation"]/1000) . "<br>");
		    	$match_participants = $match_info["participants"];
		    	foreach($match_participants as $participant){
		    		$summonernn = "";
		    		$summonerid = 0;
		    		foreach ($match_info["participantIdentities"] as $mi){
		    			if($mi["participantId"] == $participant["participantId"]){
		    				$summonernn = $mi["player"]["summonerName"];
		    				$summonerid = $mi["player"]["currentAccountId"];
		    			}
		    		}
		    		
		    		if($summonerid == $account_id){	    			
		    			$champion_id = $participant["championId"];
		    			$kda = $participant["stats"]["kills"] . "/" . $participant["stats"]["deaths"] . "/" . $participant["stats"]["assists"] . " (" . round(($participant["stats"]["kills"] + $participant["stats"]["assists"]) / $participant["stats"]["deaths"], 2) . " KDA)";
		    			$spell_1_id = $participant["spell1Id"];
		    			$spell_2_id = $participant["spell2Id"];
		    			$masteries_id = $participant["masteries"];
		    			$runes_id = $participant["runes"];
		    			$items_id = array(
		    				0 => $participant["stats"]["item0"],
		    				1 => $participant["stats"]["item1"],
		    				2 => $participant["stats"]["item2"],
		    				3 => $participant["stats"]["item3"],
		    				4 => $participant["stats"]["item4"],
		    				5 => $participant["stats"]["item5"],
		    				6 => $participant["stats"]["item6"]
	    				);    				

	    				echo("<b>" . $summonerid . " -> " . $summonernn . " -> " .$participant["participantId"]."->".$participant["teamId"]."->".$participant["stats"]["win"] . "</b><br/>");

	    				echo("<br>" . $kda . "<br>");	

	    				$champion_img = $api->getStatic("champions", $champion_id , "locale=en_US&tags=image")["image"]["full"];
    					echo("<img src='" . $CHAMPION_SQUARE . $champion_img . "'><br>");

    					$spell_1_img = $api->getStatic("summoner-spells", $spell_1_id, "locale=en_US&tags=image")["image"]["full"];
    					echo("<img src='" . $SUMMONER_SPELL . $spell_1_img . "'>");

    					$spell_2_img = $api->getStatic("summoner-spells", $spell_2_id, "locale=en_US&tags=image")["image"]["full"];
    					echo("<img src='" . $SUMMONER_SPELL . $spell_2_img . "'><br>");

    					foreach ($items_id as $item_id) {
    						if($item_id != null){
	    						$item_img = $api->getStatic("items", $item_id , "locale=en_US&tags=image")["image"]["full"];
	    						echo("<img src='" . $ITEMS . $item_img . "'>");
    						}
    					}
						
						echo("<br><br>");
		    		} else {
		    			echo($summonerid . " -> " . $summonernn . " -> " .$participant["participantId"]."->".$participant["teamId"]."->".$participant["stats"]["win"] . "<br/>");
		    		}	
		    	}

		    	break;
		    }
		} catch(Exception $e) {
		    echo "Error: " . $e->getMessage();
		};
	} else {
		echo "Problema con la peticion";
	}
	
?>
