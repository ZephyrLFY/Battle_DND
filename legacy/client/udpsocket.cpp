#include "udpsocket.h"
#include "wideuse.h"

udpThread::udpThread()
{
    bindPort();
    setTimer();
}

void udpThread::bindPort()
{
    sender = new QUdpSocket(this);
    receiver = new QUdpSocket(this);
    rcv1Port = rcvPort;
    while(!receiver->bind(rcv1Port,QUdpSocket::DontShareAddress))
        rcv1Port = rcv1Port + 2;
    sendPort = rcv1Port + 1;
    sender->bind(sendPort,QUdpSocket::DontShareAddress);
    connect(receiver,SIGNAL(readyRead()),this,SLOT(processPendingDatagram()));
}

void udpThread::setTimer()
{
    timer1 = new QTimer(this);
    timer2 = new QTimer(this);
    connect(timer1,SIGNAL(timeout()),this,SLOT(timeOut()));
    connect(timer2,SIGNAL(timeout()),this,SLOT(check()));
    timer1->start(1000);
    timer2->start(2000);
    timeOut();
}

void udpThread::timeOut()
{
    QList<QString> check;
    check << "3";
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << check;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
    count++;
}

void udpThread::check()
{
    processPendingDatagram();
    if(count>10)
    {
        QMessageBox::warning(nullptr, tr("警告！"),tr("您掉线了"),QMessageBox::Yes);
        timer2->stop();
    }
}

void udpThread::processPendingDatagram()
{
    while(receiver->hasPendingDatagrams())
    {
       QByteArray datagram;
       datagram.resize(receiver->pendingDatagramSize());
       receiver->readDatagram(datagram.data(),datagram.size());
       if(datagram.size() == 1)
       {
           count = 0;
       }
       else
       {
           QList<QString> infoM;
           QDataStream stream(&datagram, QIODevice::ReadOnly);
           stream >> infoM;
           int which = infoM.at(0).toInt();
           infoM.removeFirst();
           switch(which)
           {
           case 1:
           {
               emit inResult(infoM.at(0).toInt());
               break;
           }
           case 2:
           {
               emit onResult(infoM.at(0).toInt());
               break;
           }
           case 4:
           {
               emit outResult(infoM);
               break;
           }
           case 5:
           {
               emit alluser(infoM);
               break;
           }
           case 6:
           {
               emit allpoke(infoM);
               break;
           }
           case 7:
           {
               emit userGet(infoM);
               break;
           }
           default:
               break;
           }
       }
    }
}

void udpThread::sendIn(QList<QString> &content)
{
    /*登录*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << content;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
    receiver->waitForReadyRead();
    processPendingDatagram();
}

void udpThread::sendOn(QList<QString> &content)
{
    /*注册上线*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << content;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
    receiver->waitForReadyRead();
    processPendingDatagram();
}

void udpThread::getUsr(QList<QString> &username)
{
    /*获得用户信息*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << username;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
    receiver->waitForReadyRead();
    processPendingDatagram();
}

void udpThread::getPoke(QList<QString>& pokelist)
{
    /*获得精灵信息*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << pokelist;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
    receiver->waitForReadyRead();
    processPendingDatagram();
}

void udpThread::initUser(QList<QString>& content)
{
    /*初始化本地用户*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << content;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
    receiver->waitForReadyRead();
    processPendingDatagram();
}

void udpThread::logOut(QList<QString>& content)
{
    /*下线*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << content;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
    receiver->waitForReadyRead();
    processPendingDatagram();
}

void udpThread::handleLvl(QList<QString>& info)
{
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << info;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
}

void udpThread::addNewPoke(QList<QString>& info)
{
    /*加新精灵*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << info;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
}

void udpThread::dltMy(QList<QString>& info)
{
    /*删除精灵*/
    QByteArray temp;
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << info;
    sender->writeDatagram(temp,QHostAddress::Broadcast,45454);
}
