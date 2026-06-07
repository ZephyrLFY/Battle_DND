#ifndef LOCALUSR_H
#define LOCALUSR_H
#include <QApplication>
#include "petcreating.h"

class localUsr : public QObject
{
    Q_OBJECT
public:
    localUsr(QString name);
    ~localUsr();
    QString getName();
    void initUsr(QList<QString> &usr);
    void addPoke(QString name,qint32 level,qint32 exp,qint32 index);
    void dltPoke(qint32 index);
    void dealBadge(qint32 num,qint32 high);
    pokemon* chosePoke();
    pokemon* getEnm();
    void whichBattle(bool flag);
    bool getBattle();
    void choseToBattle(qint32 which);
    void createEnm(QList<QString> &enm);
    qint32 chosenLvl();
    qint32 getWhich();
    qint32 getSum();
    void addSum();
    void dltSum();
    void setHave(bool flag);
    bool getHave();
    void setGet(bool flag);
    bool getGet();
    void addNewPoke(int i,int index);
    int generateRandomInteger(int min,int max);
signals:
    void winInfo(QList<QString>&);
    void getNew(QList<QString>&);
    void dltMy(QList<QString>&);
private slots:
    void handleInfo(int flag);
    void getNewPoke(int flag);
    void dltPoke();
private:
    QString usrName;
    pokemon* poke[7];
    bool whichBtl;
    qint32 chosenPoke;
    pokemon* enmPoke;
    qint32 pokeSum;
    bool haveToChose = 0;
    bool getOrLose = 0;
};

#endif // LOCALUSR_H
