package mn.pinecone.dusal;

import static org.junit.Assert.assertEquals;

import mn.pinecone.dusal.DrinkWidget.Stage;
import org.junit.Test;

// How the widget's colour and face follow the day (DrinkWidget.stage). Run: ./gradlew test
public class DrinkWidgetStageTest {

    private static Stage at(int hour, int drunk) {
        return DrinkWidget.stage(drunk, 2000, false, 5, false, hour);
    }

    @Test
    public void onPaceTheDropIsHappy() {
        assertEquals(Stage.MORNING, at(9, 100));
        assertEquals(Stage.ON_TRACK, at(13, 900));
    }

    @Test
    public void fallingBehindMakesItThirstyThenLate() {
        assertEquals(Stage.THIRSTY, at(13, 200));
        assertEquals(Stage.LATE, at(16, 400));
    }

    @Test
    public void eveningEscalatesToSavingTheStreak() {
        assertEquals(Stage.DRY, at(18, 1000));
        assertEquals(Stage.SAVE, at(20, 1500));
        assertEquals(Stage.LAST, at(22, 1500));
        assertEquals(Stage.LAST, at(23, 0));
    }

    @Test
    public void aMetGoalIsCelebratedAtAnyHour() {
        assertEquals(Stage.DONE, at(10, 2000));
        assertEquals(Stage.DONE, at(23, 2600));
    }

    @Test
    public void aBrokenStreakStartsAgainUntilTheGoalIsMet() {
        assertEquals(Stage.RESET, DrinkWidget.stage(300, 2000, false, 0, true, 21));
        assertEquals(Stage.DONE, DrinkWidget.stage(2000, 2000, false, 0, true, 21));
    }

    @Test
    public void aDoctorsLimitNeverPushes() {
        assertEquals(Stage.LIMIT, DrinkWidget.stage(0, 1500, true, 0, false, 23));
        assertEquals(Stage.LIMIT, DrinkWidget.stage(1600, 1500, true, 0, false, 12));
    }
}
