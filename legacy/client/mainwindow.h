#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QMessageBox>
#include <QStandardItemModel>
#include <QGraphicsScene>
#include <QGraphicsItem>
#include <QKeyEvent>
#include <QMediaPlayer>
#include <QMediaPlaylist>
#include <QTimer>

namespace Ui {
class MainWindow;
}

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow();
signals:
    void initUser(QList<QString>&);
    void logOut(QList<QString>&);
private slots:
    void getUser(QList<QString>& content);
    void outResult(QList<QString>& content);
    void on_logoutBtn_clicked();
    void on_lvlBtn_clicked();
    void on_action_triggered();
    void on_action_2_triggered();
    void on_musicBtn_clicked();
    void on_btlBtn_clicked();
    void updateDT();
    void keyPressEvent(QKeyEvent *e);
private:
    void initLocalUser();
    void setConnectWithThread();
    void initMap();
    void setTimer();
    void initScene();
    void initSceneBackground();
    void loseLink();
    void keyUp();
    void keyLeft();
    void keyRight();
    void keyDown();
    Ui::MainWindow *ui;
    bool isMusic = 0;
    bool isPlaying = 0;
    bool online = 1;
    QGraphicsScene *scene;
    QMediaPlayer *player;
    QMediaPlaylist *playlist;
    QGraphicsItem *zhi;
    QTimer *timer;
};

#endif // MAINWINDOW_H
