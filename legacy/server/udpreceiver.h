#ifndef UDPRECEIVER_H
#define UDPRECEIVER_H

#include <QMainWindow>
#include <QtNetwork>
#include <QDebug>
#include "database.h"

namespace Ui {
class udpReceiver;
}

class udpReceiver : public QMainWindow
{
    Q_OBJECT

public:
    explicit udpReceiver(QWidget *parent = nullptr);
    ~udpReceiver();
    void bindPort();

private slots:
    void dealDatagram();//收信息
    void usrs(int inOrNew,QString name,QString pwd,QHostAddress address,quint16 hisPort);//用户登录或注册
    qint32 userIn(QString name,QString pwd);//登录
    bool newUsr(QString name,QString pwd);//注册
    void txShow(QHostAddress address,quint16 hisPort);//判断连接是否正常
    void linkOver(QString name,QHostAddress address,quint16 hisPort);
    void userInfo(QHostAddress address,quint16 hisPort);
    void pokeInfo(QHostAddress address,quint16 hisPort);
    void usrPoke(QString name,QHostAddress address,quint16 hisPort);
    void handleWinner(QList<QString> &info);
    void handleLoser(QList<QString> &info);
    void addNewPoke(QList<QString> &info);
    void dltPoke(QList<QString> &info);
private:
    Ui::udpReceiver *ui;
    QUdpSocket *sender;
    QUdpSocket *receiver;
    Log *loger;
    quint16 rcvPort = 45454;
    quint16 sendPort = 27032;
};

#endif // UDPRECEIVER_H
